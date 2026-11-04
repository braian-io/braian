import { workspaceDisplayName } from './demo-labels'
import type { PaletteItem } from './palette-model'

export type PaletteWorkspace = { id: string; name: string; share_token?: string | null }

/** Workspaces for the Open workspace sub-list. */
export function workspacePaletteRows(workspaces: PaletteWorkspace[]): PaletteItem[] {
  return workspaces.map((workspace, index) => ({
    id: `workspace:${workspace.id}`,
    group: 'views' as const,
    title: workspaceDisplayName(workspace.name, workspace.share_token),
    subtitle: 'Open workspace',
    entity: true,
    keywords: [workspace.name, workspace.share_token ?? ''].filter(Boolean),
    kbd: index < 9 ? `Ctrl+${index + 1}` : undefined,
    shortcut: index < 9 ? `Ctrl+${index + 1}` : undefined,
  }))
}
