import type { Json } from './api'
import { setModelFocus } from './model-stage'
import type { ModelSelection } from './model-view'

const SELECTION_KEY = 'braian.modelSelection'
const KNOWN_KEY = 'braian.modelKeys'

type KnownModel = { types: string[]; groups: string[] }

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

function isKnown(value: unknown): value is KnownModel {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Array.isArray(record.types) && record.types.every((item) => typeof item === 'string')
    && Array.isArray(record.groups) && record.groups.every((item) => typeof item === 'string')
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

function readKnown(): KnownModel | null {
  const store = storageOrNull()
  if (!store) return null
  try {
    const raw = store.getItem(KNOWN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isKnown(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeKnown(next: KnownModel) {
  const store = storageOrNull()
  if (!store) return
  try {
    store.setItem(KNOWN_KEY, JSON.stringify(next))
  } catch {
    // A full or disabled storage must not break the view.
  }
}

function selectionExists(next: ModelSelection, known: KnownModel) {
  if (next.kind === 'type') return known.types.includes(next.typeKey)
  return known.groups.includes(`${next.structure}/${next.group}`)
}

/** Types and groups seen in the last loaded definitions, if any. */
let known: KnownModel | null = readKnown()

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
// empty after Save + F5. A stored key that no longer exists is dropped before
// any component can show it as a title.
let selection: ModelSelection | null = readStoredSelection()
if (selection && known && !selectionExists(selection, known)) {
  selection = null
  writeStoredSelection(null)
}
if (selection?.kind === 'type') previewType = selection.typeKey

function notify() {
  for (const listen of listeners) listen()
}

/**
 * Remembers the current definitions so a stored selection can be validated
 * against them, both now and on the next reload. A selection for a type or
 * group that was deleted (or never existed) is cleared, never rendered raw.
 */
export function registerModelDefinitions(defs: Json | undefined) {
  if (!defs) return
  const types: string[] = []
  for (const raw of (defs.types as Json[] | undefined) ?? []) {
    const key = String(raw.key ?? '')
    const id = String(raw.id ?? '')
    if (key) types.push(key)
    if (id && id !== key) types.push(id)
  }
  const groups: string[] = []
  for (const raw of (defs.structures as Json[] | undefined) ?? []) {
    const structureKey = String(raw.key ?? raw.id ?? '')
    if (!structureKey) continue
    for (const group of (raw.groups as Json[] | undefined) ?? []) {
      const groupKey = String(group.key ?? '')
      if (groupKey) groups.push(`${structureKey}/${groupKey}`)
    }
  }
  known = { types: [...new Set(types)], groups: [...new Set(groups)] }
  writeKnown(known)
  if (selection && !selectionExists(selection, known)) {
    selection = null
    previewType = ''
    writeStoredSelection(null)
    notify()
  }
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
