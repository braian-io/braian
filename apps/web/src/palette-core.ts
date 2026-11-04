import type { PaletteItem } from './palette-model'

/** One level pushed by a command that takes an argument, or by an action panel. */
export type PaletteFrame = {
  label: string
  rows: PaletteItem[]
  /** Param type from the operation schema: `view`, `workspace`, `object`, or a type key. */
  paramType?: string
}

export type PaletteMode = 'list' | 'ai' | 'fields'

export type PaletteKeyInput = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  query: string
  inQueryField: boolean
  mode: PaletteMode
  stackDepth: number
  /** Esc closes the palette instead of popping (opened straight into that submenu). */
  escapeCloses: boolean
  activeIndex: number | null
  rowCount: number
  /** The row Enter would run: the highlight, or the first row when nothing is highlighted. */
  row?: {
    argument?: boolean
    entity?: boolean
    ask?: boolean
    disabled?: boolean
  }
}

export type PaletteKeyEffect =
  | { type: 'none' }
  | { type: 'caret' }
  | { type: 'close' }
  | { type: 'back' }
  | { type: 'ask' }
  | { type: 'activate'; index: number }
  | { type: 'actions'; index: number }
  | { type: 'move'; index: number }

/**
 * One decision for every palette key. Enter is always `activate`;
 * the caller runs that row in a single function.
 */
export function paletteKeyEffect(input: PaletteKeyInput): PaletteKeyEffect {
  const mod = input.ctrlKey || input.metaKey
  if (input.key === 'Escape') {
    if (input.escapeCloses && input.mode === 'list' && input.stackDepth > 0) return { type: 'close' }
    if (input.stackDepth > 0 && input.mode === 'list') return { type: 'back' }
    return { type: 'close' }
  }
  if (input.key === 'Backspace' && input.query === '' && input.stackDepth > 0 && input.mode === 'list') {
    return { type: 'back' }
  }
  if (mod && (input.key === 'j' || input.key === 'J')) return { type: 'ask' }
  if (input.key === 'Tab' && input.mode === 'list') {
    const index = input.activeIndex ?? 0
    if (input.row?.argument && !input.row.disabled) return { type: 'activate', index }
    return { type: 'none' }
  }
  if (mod && (input.key === 'Enter' || input.key === '.' || input.key === 'k' || input.key === 'K')) {
    if (input.mode !== 'list' || input.rowCount === 0) return { type: 'none' }
    const index = input.activeIndex ?? 0
    if (input.row?.entity) return { type: 'actions', index }
    return { type: 'none' }
  }
  if (input.key === 'ArrowRight' && input.mode === 'list' && input.row?.entity) {
    return { type: 'actions', index: input.activeIndex ?? 0 }
  }
  if ((input.key === 'Home' || input.key === 'End') && input.inQueryField) return { type: 'caret' }
  if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Enter'].includes(input.key)) {
    return { type: 'none' }
  }
  if (input.mode === 'ai' && input.key === 'Enter' && input.inQueryField) return { type: 'ask' }
  if (input.rowCount === 0 || input.mode === 'ai') return { type: 'none' }
  if (input.key === 'Enter') return { type: 'activate', index: input.activeIndex ?? 0 }
  const page = 8
  const current = input.activeIndex ?? -1
  const last = input.rowCount - 1
  const next =
    input.key === 'ArrowDown'
      ? Math.min(last, current + 1)
      : input.key === 'ArrowUp'
        ? Math.max(0, current < 0 ? last : current - 1)
        : input.key === 'PageDown'
          ? Math.min(last, (current < 0 ? 0 : current) + page)
          : input.key === 'PageUp'
            ? Math.max(0, (current < 0 ? 0 : current) - page)
            : input.key === 'Home'
              ? 0
              : last
  return { type: 'move', index: next }
}

/** `ui.place` takes a view id. Workspace rows store `workspace:<id>`. */
export function placeTargetId(sourceId: string): string {
  if (sourceId.startsWith('workspace:')) return sourceId.slice('workspace:'.length)
  if (sourceId.startsWith('view:')) return sourceId.slice('view:'.length)
  return sourceId
}

export function argumentBreadcrumb(title: string): string {
  const trimmed = title.replace(/\s*›\s*$/, '').trim()
  return `${trimmed} ›`
}

/** Typesense filter for an object-typed palette argument. `object` searches every type. */
export function objectTypeFilter(paramType: string | undefined): string | undefined {
  if (!paramType || paramType === 'object' || paramType === 'view' || paramType === 'workspace') return undefined
  return `type_key:=${paramType}`
}

export function isObjectParam(paramType: string | undefined): boolean {
  return Boolean(paramType && paramType !== 'view' && paramType !== 'workspace')
}
