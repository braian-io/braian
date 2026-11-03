import { useQuery } from '@tanstack/react-query'
import type { Json } from './api'
import { copy } from './i18n'
import {
  migrateLayout,
  tabGroup,
  views as layoutViews,
  type Node,
} from './layout'
import type { PaletteItem } from './palette-model'
import {
  createWorkspaceFromTemplate,
  canonicalShareToken,
  workspaceTemplates,
  type WorkspaceTemplate,
} from './templates'
import type { TypeName } from './type-labels'

export type ListedTemplateWorkspace = { id: string; name: string; share_token?: string | null }

export type SavedWorkspaceTemplate = {
  key: string
  name: string
  definition: unknown
  updated_at?: string
}

type SavedTemplateView = {
  id?: string
  type: string
  title: string
  state?: Json
}

export class SavedTemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SavedTemplateError'
  }
}

async function fetchSavedWorkspaceTemplates(): Promise<SavedWorkspaceTemplate[]> {
  const response = await fetch('/v1/workspace-templates', { credentials: 'include' })
  if (!response.ok) {
    throw new Error((await response.text()) || `workspace templates ${response.status}`)
  }
  const body = await response.json()
  if (!Array.isArray(body)) {
    throw new Error('workspace templates response was not an array')
  }
  return body.flatMap((item): SavedWorkspaceTemplate[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    if (typeof record.key !== 'string' || record.key.length === 0) return []
    return [{
      key: record.key,
      name: typeof record.name === 'string' && record.name.length > 0 ? record.name : record.key,
      definition: record.definition,
      updated_at: typeof record.updated_at === 'string' ? record.updated_at : undefined,
    }]
  })
}

export function useSavedWorkspaceTemplatesQuery(enabled = true) {
  return useQuery({
    queryKey: ['workspace-templates'],
    queryFn: fetchSavedWorkspaceTemplates,
    staleTime: 30_000,
    enabled: enabled && typeof window !== 'undefined',
  })
}

/** Palette root row that opens the New from template submenu. */
export function newFromTemplateRootItem(): PaletteItem {
  return {
    id: 'workspace:new',
    group: 'views',
    title: `${copy.newWorkspace} ›`,
    subtitle: 'Create or open a workspace from a template',
    keywords: ['new', 'template', 'workspace', 'tab', 'create'],
  }
}

/** Rows listed under "New from template ›". */
export function newFromTemplateSubmenuRows(
  types: TypeName[],
  workspaces: ListedTemplateWorkspace[] = [],
  savedTemplates: SavedWorkspaceTemplate[] = [],
): PaletteItem[] {
  return [
    ...workspaceTemplates(types).map((template) => templatePaletteItem(template, workspaces)),
    ...savedTemplates.map((template) => savedTemplatePaletteItem(template)),
  ]
}

export function templatePaletteItem(
  template: WorkspaceTemplate,
  workspaces: ListedTemplateWorkspace[] = [],
): PaletteItem {
  const token = canonicalShareToken(template)
  const open = token ? workspaces.some((row) => row.share_token === token) : false
  const summary = template.summary
  return {
    id: `template:${template.id}`,
    group: 'views',
    title: template.name,
    subtitle: open ? `Open existing · ${summary}` : `Create · ${summary}`,
    keywords: ['template', template.id, template.name, open ? 'open' : 'create'],
  }
}

export function savedTemplatePaletteItem(template: SavedWorkspaceTemplate): PaletteItem {
  return {
    id: `saved-template:${template.key}`,
    group: 'views',
    title: template.name,
    subtitle: 'Create · Saved workspace template',
    keywords: ['template', 'saved', 'workspace', template.key, template.name, 'create'],
  }
}

export function isNewFromTemplateRoot(id: string) {
  return id === 'workspace:new'
}

export function parseSavedTemplateChoice(id: string): string | undefined {
  return id.startsWith('saved-template:') ? id.slice('saved-template:'.length) : undefined
}

function isLayoutNode(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    record.type === 'tabs' ||
    record.type === 'split' ||
    Array.isArray(record.tabs) ||
    ((record.direction === 'row' || record.direction === 'column') && Boolean(record.first) && Boolean(record.second))
  )
}

function definitionRecord(definition: unknown, name: string): Json {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new SavedTemplateError(`Cannot create workspace from "${name}": its definition is not an object.`)
  }
  return definition as Json
}

function readDefinitionViews(definition: Json, name: string): SavedTemplateView[] {
  const raw = definition.views
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new SavedTemplateError(`Cannot create workspace from "${name}": its definition has no views.`)
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new SavedTemplateError(`Cannot create workspace from "${name}": view ${index + 1} is not an object.`)
    }
    const record = item as Json
    const type = typeof record.type === 'string' ? record.type : ''
    if (!type) {
      throw new SavedTemplateError(`Cannot create workspace from "${name}": view ${index + 1} has no type.`)
    }
    return {
      id: typeof record.id === 'string' && record.id.length > 0 ? record.id : undefined,
      type,
      title: typeof record.title === 'string' && record.title.length > 0 ? record.title : type,
      state: record.state && typeof record.state === 'object' && !Array.isArray(record.state)
        ? (record.state as Json)
        : undefined,
    }
  })
}

export function workspaceTemplateFromSavedTemplate(template: SavedWorkspaceTemplate): WorkspaceTemplate {
  const definition = definitionRecord(template.definition, template.name)
  const specs = readDefinitionViews(definition, template.name)
  const oldIds = specs.map((view, index) => view.id ?? `saved-template-view-${index}`)
  if (new Set(oldIds).size !== oldIds.length) {
    throw new SavedTemplateError(`Cannot create workspace from "${template.name}": its views have duplicate ids.`)
  }

  const rawLayout = 'layout' in definition
    ? definition.layout
    : isLayoutNode(definition) ? definition : undefined
  let layout: Node
  try {
    layout = migrateLayout(rawLayout === undefined ? tabGroup(oldIds) : rawLayout)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'its layout is invalid'
    throw new SavedTemplateError(`Cannot create workspace from "${template.name}": ${detail}.`)
  }
  const open = layoutViews(layout)
  if (open.length === 0) {
    throw new SavedTemplateError(`Cannot create workspace from "${template.name}": its layout is empty.`)
  }
  const known = new Set(oldIds)
  const missing = open.filter((id) => !known.has(id))
  if (missing.length > 0) {
    throw new SavedTemplateError(
      `Cannot create workspace from "${template.name}": its layout references views that are not defined.`,
    )
  }

  return {
    id: `saved:${template.key}`,
    name: template.name,
    summary: 'Saved workspace template',
    views: specs.map((view) => ({
      type: view.type,
      title: view.title,
      state: view.state,
    })),
    layout: (ids) => remapLayout(layout, oldIds, ids),
  }
}

export async function createWorkspaceFromSavedTemplate(template: SavedWorkspaceTemplate): Promise<string> {
  return createWorkspaceFromTemplate(workspaceTemplateFromSavedTemplate(template))
}

function remapLayout(layout: Node, oldIds: string[], ids: string[]): Node {
  const map = new Map(oldIds.map((id, index) => [id, ids[index] ?? '']))
  const visit = (node: Node): Node =>
    node.type === 'tabs'
      ? { ...node, views: node.views.map((view) => map.get(view) ?? '') }
      : { ...node, children: node.children.map(visit) }
  return visit(layout)
}
