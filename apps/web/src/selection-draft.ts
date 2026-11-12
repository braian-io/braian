import type { Json } from './api'
import {
  selectionFilterText,
  selectionKind,
  type NewSelectionRequest,
  type SelectionKind,
} from './assortment-filter'

/**
 * One create or edit draft for a saved selection.
 *
 * New and Edit selection both go through the Selections view and its Detail.
 * Nothing is written until the shared draft bar saves; Discard, Escape, or
 * closing the detail throws the draft away.
 */
export type SelectionDraft = {
  mode: 'create' | 'edit'
  id: string | null
  name: string
  type: string
  kind: SelectionKind
  query: string
  /** The stored query of an edited selection, kept for a manual selection. */
  manual: Json
}

let draft: SelectionDraft | null = null
const listeners = new Set<() => void>()

export function getSelectionDraft(): SelectionDraft | null {
  return draft
}

export function subscribeSelectionDraft(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(next: SelectionDraft | null) {
  draft = next
  for (const listener of listeners) listener()
}

export function startNewSelection(request: NewSelectionRequest, fallbackType = '') {
  emit({
    mode: 'create',
    id: null,
    name: request.name ?? '',
    type: request.type || fallbackType,
    kind: request.kind === 'dynamic' ? 'dynamic' : 'manual',
    query: request.query ?? '',
    manual: {},
  })
}

export function startEditSelection(item: Json, fallbackType = '') {
  emit({
    mode: 'edit',
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    type: String(item.type ?? item.type_id ?? fallbackType),
    kind: selectionKind(item.kind),
    query: selectionFilterText(item.query),
    manual: (item.query as Json | undefined) ?? {},
  })
}

export function updateSelectionDraft(patch: Partial<SelectionDraft>) {
  if (!draft) return
  emit({ ...draft, ...patch })
}

export function discardSelectionDraft() {
  if (!draft) return
  emit(null)
}
