import type { Json } from './api'
import {
  selectionFilterText,
  selectionKind,
  selectionSearchText,
  type NewSelectionRequest,
  type SelectionKind,
} from './assortment-filter'

/**
 * One create or edit draft for a saved selection.
 *
 * The form state lives here. The Save bar does not: it is the same bar as
 * objects and model edits, and it is painted only in the Selections pane,
 * and only after a field differs from the snapshot taken when the form
 * opened. While that bar is showing, object panes hide theirs.
 */
export type SelectionBaseline = {
  name: string
  type: string
  kind: SelectionKind
  query: string
  q: string
}

export type SelectionDraft = {
  mode: 'create' | 'edit'
  id: string | null
  name: string
  type: string
  kind: SelectionKind
  query: string
  /** Table search term saved with a dynamic filter. */
  q: string
  /** The stored query of an edited selection, kept for a manual selection. */
  manual: Json
  baseline: SelectionBaseline
}

let draft: SelectionDraft | null = null
let surfaces = 0
const listeners = new Set<() => void>()

export function getSelectionDraft(): SelectionDraft | null {
  return draft
}

export function subscribeSelectionDraft(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener()
}

function emit(next: SelectionDraft | null) {
  draft = next
  notify()
}

function opened(draft: Omit<SelectionDraft, 'baseline'>): SelectionDraft {
  return {
    ...draft,
    baseline: {
      name: draft.name,
      type: draft.type,
      kind: draft.kind,
      query: draft.query,
      q: draft.q,
    },
  }
}

/** How many fields differ from the snapshot taken when the form opened. */
export function selectionDraftChanges(draft: SelectionDraft): number {
  const base = draft.baseline
  let count = 0
  if (draft.name !== base.name) count += 1
  if (draft.kind !== base.kind) count += 1
  if (draft.query !== base.query) count += 1
  if (draft.q !== base.q) count += 1
  if (base.type && draft.type !== base.type) count += 1
  return count
}

/**
 * The Selections pane is on screen. The Save bar belongs to that pane, so
 * object panes yield while this is true and the form has a real edit.
 */
export function retainSelectionSurface(): () => void {
  surfaces += 1
  notify()
  return () => {
    surfaces = Math.max(0, surfaces - 1)
    notify()
  }
}

/** True when the Selections pane should be the only Save bar on screen. */
export function getSelectionBarActive(): boolean {
  return surfaces > 0 && draft != null && selectionDraftChanges(draft) > 0
}

export function startNewSelection(request: NewSelectionRequest, fallbackType = '') {
  emit(opened({
    mode: 'create',
    id: null,
    name: request.name ?? '',
    type: request.type || fallbackType,
    kind: request.kind === 'dynamic' ? 'dynamic' : 'manual',
    query: request.query ?? '',
    q: request.q ?? '',
    manual: {},
  }))
}

export function startEditSelection(item: Json, fallbackType = '') {
  emit(opened({
    mode: 'edit',
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    type: String(item.type ?? item.type_id ?? fallbackType),
    kind: selectionKind(item.kind),
    query: selectionFilterText(item.query),
    q: selectionSearchText(item.query),
    manual: (item.query as Json | undefined) ?? {},
  }))
}

export function updateSelectionDraft(patch: Partial<Omit<SelectionDraft, 'baseline' | 'mode' | 'id'>>) {
  if (!draft) return
  emit({ ...draft, ...patch })
}

export function discardSelectionDraft() {
  if (!draft) return
  emit(null)
}
