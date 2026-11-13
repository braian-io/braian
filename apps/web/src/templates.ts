import { api, type Json } from './api'
import { splitPair, tabGroup, type Node } from './layout'
import { typeNames, type TypeName } from './type-labels'
import { MODEL_WORKSPACE_VIEW_SPECS, modelWorkspaceLayout } from './model-workspace-migrate'
import { typeShareToken, typeUsesTree } from './type-workspaces'
import { linkedTypeIds } from './view-source'

export type WorkspaceTemplate = {
  id: string
  name: string
  summary: string
  views: Array<{
    type: string
    title: string
    state?: Json | ((ids: string[]) => Json)
  }>
  layout: (ids: string[]) => Node
}

const TABLE_STATE = {
  columns: ['number', 'name', 'type', 'status'],
  sort: 'number',
}

/** First linked object type in definition order, never a link type itself. */
function firstLinkedType(type: TypeName, defs: Json | undefined): TypeName | undefined {
  if (!defs || !type.id) return undefined
  const linkedId = linkedTypeIds(type.id, defs)[0]
  if (!linkedId) return undefined
  return typeNames(defs, 'en').find(
    (item) => item.id === linkedId && item.kind !== 'link' && item.key,
  )
}

export function typeWorkspaceTemplate(type: TypeName, defs?: Json): WorkspaceTemplate {
  const tree = typeUsesTree(type)
  const treeTitle = type.structureLabel || 'Structure'
  const linked = firstLinkedType(type, defs)
  const mainIndex = tree ? 2 : 1
  const peerIndex = linked ? mainIndex + 1 : -1
  const rightIndex = linked ? peerIndex + 1 : mainIndex + 1
  const views: WorkspaceTemplate['views'] = [
    ...(tree ? [{ type: 'structure_tree', title: treeTitle, state: {} }] : []),
    { type: 'assortment_list', title: 'Selections', state: {} },
    {
      type: 'object_table',
      title: type.plural,
      state: { ...TABLE_STATE, object_type: type.id, type_key: type.key },
    },
    ...(linked
      ? [{
          type: 'object_table',
          title: linked.plural,
          state: (ids: string[]) => ({
            ...TABLE_STATE,
            object_type: linked.id,
            type_key: linked.key,
            source: { kind: 'peer', viewId: ids[mainIndex], selection: 'row' },
          }),
        }]
      : []),
    { type: 'object_detail', title: 'Detail', state: { language: 'en' } },
    { type: 'graph', title: 'Graph', state: {} },
    { type: 'history', title: 'History', state: {} },
    ...(tree ? [{ type: 'class_attributes', title: 'Group attributes', state: {} }] : []),
  ]
  return {
    id: `type:${type.key}`,
    name: type.plural,
    summary: linked
      ? tree
        ? 'Selections, structure, list, linked list, detail, graph, history and group attributes'
        : 'Selections, list, linked list, detail, graph and history'
      : tree
        ? 'Selections, structure, list, detail, graph, history and group attributes'
        : 'Selections, list, detail, graph and history',
    views,
    layout: (ids) => {
      const left = tabGroup(ids.slice(0, tree ? 2 : 1).filter(Boolean))
      const main = tabGroup([ids[mainIndex] ?? ''].filter(Boolean))
      const right = tabGroup(ids.slice(rightIndex))
      if (!linked) {
        return splitPair('horizontal', 0.22, left, splitPair('horizontal', 0.62, main, right))
      }
      const peer = tabGroup([ids[peerIndex] ?? ''].filter(Boolean))
      return splitPair(
        'horizontal',
        0.22,
        left,
        splitPair('horizontal', 0.5, main, splitPair('horizontal', 0.5, peer, right)),
      )
    },
  }
}

export function workspaceTemplates(types: TypeName[] = [], defs?: Json): WorkspaceTemplate[] {
  return [
  ...types
    .filter((type) => type.kind !== 'link' && type.id && type.key)
    .map((type) => typeWorkspaceTemplate(type, defs)),
  {
    id: 'model',
    name: 'Data model',
    summary: 'Object types, links, value lists, units and attribute definitions',
    views: MODEL_WORKSPACE_VIEW_SPECS.map((view) => ({
      type: view.type,
      title: view.title,
      state: { ...view.state },
    })),
    layout: (ids) => modelWorkspaceLayout(ids),
  },
  {
    id: 'review',
    name: 'Review',
    summary: 'Changes waiting for review, batches and jobs',
    views: [
      { type: 'proposal_list', title: 'Proposals', state: {} },
      { type: 'proposal', title: 'Proposal', state: {} },
      { type: 'batch_log', title: 'Batch log', state: {} },
      { type: 'job_history', title: 'Jobs', state: {} },
      { type: 'import_mappings', title: 'Import mappings', state: {} },
    ],
    layout: (ids) =>
      splitPair('horizontal', 0.3, tabGroup([ids[0]]), splitPair('horizontal', 0.74, tabGroup([ids[1]]), tabGroup(ids.slice(2)))),
  },
  ]
}


/** True for object-type templates, which the palette may copy when canonical exists. */
export function isTypeWorkspaceTemplate(template: Pick<WorkspaceTemplate, 'id'>): boolean {
  return template.id.startsWith('type:')
}

/** Stable share token for seeded / type workspaces. Undefined → personal user-* copy. */
export function canonicalShareToken(template: WorkspaceTemplate): string | undefined {
  if (template.id === 'model') return 'braian-model'
  if (template.id === 'review') return 'braian-review'
  if (isTypeWorkspaceTemplate(template)) return typeShareToken(template.id.slice('type:'.length))
  return undefined
}

/** Next free "{name} {n}" among taken names, starting at 2. */
export function nextWorkspaceName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  let index = 2
  while (used.has(`${name} ${index}`)) index += 1
  return `${name} ${index}`
}

/**
 * Rebuild a type template from the stored definitions so callers that only
 * pass a `TypeName` still get link-aware views such as the peer table.
 */
async function withTypeDefinitions(template: WorkspaceTemplate): Promise<WorkspaceTemplate> {
  if (!template.id.startsWith('type:')) return template
  const key = template.id.slice('type:'.length)
  try {
    const defs = await api.get('/v1/definitions')
    const type = typeNames(defs, 'en').find((item) => item.key === key)
    return type ? typeWorkspaceTemplate(type, defs) : template
  } catch {
    return template
  }
}

export async function createWorkspaceFromTemplate(
  input: WorkspaceTemplate,
  options?: { shareToken?: string; forceNew?: boolean },
) {
  const template = await withTypeDefinitions(input)
  const canonical = options?.shareToken ?? canonicalShareToken(template)
  let shareToken = canonical
  let name = template.name
  if (canonical) {
    const listed = await api.get('/v1/workspaces')
    const rows = listed.workspaces ?? []
    const existing = rows.find((row) => row.share_token === canonical)
    if (existing?.id) {
      // New from template on an object type makes a personal copy instead of
      // reopening the canonical workspace. Model and Review keep reopening it.
      if (!options?.forceNew) return existing.id
      shareToken = undefined
      name = nextWorkspaceName(template.name, rows.map((row) => row.name))
    }
  }
  const workspaceId = crypto.randomUUID()
  const viewIds = template.views.map(() => crypto.randomUUID())
  const token = shareToken ?? `user-${workspaceId.slice(0, 8)}`
  try {
    await api.post('/v1/workspaces', { body: {
        id: workspaceId,
        name,
        locked: false,
        share_token: token,
        layout: template.layout(viewIds),
      } })
  } catch (error) {
    if (shareToken) {
      // Unique share_token race: another tab created the canonical workspace first.
      const listed = await api.get('/v1/workspaces')
      const existing = listed.workspaces?.find((row) => row.share_token === shareToken)
      if (existing?.id) return existing.id
    }
    throw error
  }
  for (const [index, view] of template.views.entries()) {
    await api.post('/v1/views', { body: {
        id: viewIds[index],
        workspace_id: workspaceId,
        type: view.type,
        title: view.title,
        pane: index === 0 ? 'left' : 'main',
        position: index,
        state: typeof view.state === 'function' ? view.state(viewIds) : (view.state ?? {}),
      } })
  }
  return workspaceId
}
