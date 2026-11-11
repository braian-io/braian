import { setModelFocus } from './model-stage'
import type { ModelSelection } from './model-view'

const SELECTION_KEY = 'braian.modelSelection'

let previewType = ''
const listeners = new Set<() => void>()

function storageOrNull(): Storage | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function isSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (record.kind === 'type') return typeof record.typeKey === 'string' && record.typeKey.length > 0
  if (record.kind === 'group') {
    return typeof record.structure === 'string' && record.structure.length > 0
      && typeof record.group === 'string' && record.group.length > 0
  }
  return false
}

function readStoredSelection(): ModelSelection | null {
  const store = storageOrNull()
  if (!store) return null
  try {
    const raw = store.getItem(SELECTION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isSelection(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeStoredSelection(next: ModelSelection | null) {
  const store = storageOrNull()
  if (!store) return
  try {
    if (next) store.setItem(SELECTION_KEY, JSON.stringify(next))
    else store.removeItem(SELECTION_KEY)
  } catch {
    // A full or disabled storage must not break the view.
  }
}

// The Data model view is restored by the workspace and view persistence. The
// selected type has to survive the same reload, or Type attributes reopens
// empty after Save + F5.
let selection: ModelSelection | null = readStoredSelection()
if (selection?.kind === 'type') previewType = selection.typeKey

function notify() {
  for (const listen of listeners) listen()
}

export function chooseModelSelection(next: ModelSelection) {
  selection = next
  if (next.kind === 'type') {
    previewType = next.typeKey
    setModelFocus({ kind: 'type', key: next.typeKey })
  } else {
    setModelFocus({ kind: 'structure', key: next.structure })
  }
  writeStoredSelection(next)
  notify()
}

export function setPreviewType(typeKey: string) {
  previewType = typeKey
  notify()
}

export function getModelSelection() {
  return selection
}

export function getPreviewType() {
  return previewType
}

export function subscribeModelSelection(listen: () => void) {
  listeners.add(listen)
  return () => {
    listeners.delete(listen)
  }
}
