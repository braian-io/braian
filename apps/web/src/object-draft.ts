import { textValue, type Json } from './api'

/**
 * One draft for an object's unsaved cells, shared by the table and Detail.
 *
 * A late or older read cannot replace a pending cell or a value that was saved
 * at a newer version than that read.
 */

export type DraftPrincipal = 'human' | 'agent' | 'integration'

export type ObjectDraftCell = {
  objectId: string
  attribute: string
  columnId: string
  language?: string
  baseVersion: number
  originalText: string
  proposedText: string
  value: unknown
}

type Committed = {
  version: number
  texts: Record<string, string>
  values: Json
}

type Snapshot = {
  cells: ObjectDraftCell[]
  committed: Record<string, Committed>
}

let state: Snapshot = { cells: [], committed: {} }
const listeners = new Set<() => void>()

export function resetObjectDrafts(): void {
  state = { cells: [], committed: {} }
  for (const listener of listeners) listener()
}

export function subscribeObjectDrafts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getObjectDraftSnapshot(): Snapshot {
  return state
}

function emit(next: Snapshot) {
  state = next
  for (const listener of listeners) listener()
}

function cellKey(cell: { objectId: string; attribute: string; language?: string }): string {
  return `${cell.objectId}\n${cell.attribute}\n${cell.language ?? ''}`
}

export function objectDraftCells(objectId?: string): ObjectDraftCell[] {
  return objectId ? state.cells.filter((cell) => cell.objectId === objectId) : [...state.cells]
}

export function stageObjectCell(cell: ObjectDraftCell): void {
  const id = cellKey(cell)
  const previous = state.cells.find((item) => cellKey(item) === id)
  const originalText = previous?.originalText ?? cell.originalText
  const baseVersion = previous?.baseVersion ?? cell.baseVersion
  const rest = state.cells.filter((item) => cellKey(item) !== id)
  if (!cell.language) {
    const withoutAttribute = rest.filter(
      (item) => !(item.objectId === cell.objectId && item.attribute === cell.attribute),
    )
    if (cell.proposedText === originalText) {
      emit({ ...state, cells: withoutAttribute })
      return
    }
    emit({
      ...state,
      cells: [...withoutAttribute, { ...cell, originalText, baseVersion }],
    })
    return
  }
  if (cell.proposedText === originalText) {
    emit({ ...state, cells: rest })
    return
  }
  emit({ ...state, cells: [...rest, { ...cell, originalText, baseVersion }] })
}

export function discardObjectDraft(objectId: string): void {
  emit({ ...state, cells: state.cells.filter((cell) => cell.objectId !== objectId) })
}

export function draftBaseVersion(objectId: string): number | null {
  const cells = objectDraftCells(objectId)
  if (cells.length === 0) return null
  return Math.min(...cells.map((cell) => cell.baseVersion))
}

/** Version a new edit is based on: the open draft, else a save the server has not caught up to. */
export function editBaseVersion(objectId: string, serverVersion: number): number {
  const open = draftBaseVersion(objectId)
  if (open != null) return open
  const committed = state.committed[objectId]
  if (committed && serverVersion < committed.version) return committed.version
  return serverVersion
}

function mergeAttribute(current: unknown, next: unknown): unknown {
  if (
    current && next
    && typeof current === 'object' && typeof next === 'object'
    && !Array.isArray(current) && !Array.isArray(next)
  ) {
    return { ...(current as Json), ...(next as Json) }
  }
  return next
}

export function draftValues(objectId: string): Json {
  const values: Json = {}
  for (const cell of objectDraftCells(objectId)) {
    if (cell.language) {
      const map = values[cell.attribute]
      const base = map && typeof map === 'object' && !Array.isArray(map) ? { ...(map as Json) } : {}
      base[cell.language] = cell.value as Json[string]
      values[cell.attribute] = base
    } else {
      values[cell.attribute] = cell.value as Json[string]
    }
  }
  return values
}

export function noteObjectDraftSaved(objectId: string, version: number): void {
  const cells = objectDraftCells(objectId)
  const texts: Record<string, string> = {}
  for (const cell of cells) {
    texts[cell.columnId] = cell.proposedText
    texts[cell.attribute] = cell.proposedText
    if (cell.language) texts[`${cell.attribute}@${cell.language}`] = cell.proposedText
  }
  const committed = {
    ...state.committed,
    [objectId]: { version, texts, values: draftValues(objectId) },
  }
  emit({
    cells: state.cells.filter((cell) => cell.objectId !== objectId),
    committed,
  })
}

export type CellPaint = {
  text: string
  drafted: boolean
  held: boolean
  originalText?: string
}

/**
 * What a cell shows. A pending draft wins. Otherwise a save newer than this
 * read wins, including when a fresher read already arrived and this one is late.
 */
export function paintObjectCell(input: {
  objectId: string
  columnId: string
  attribute: string
  language?: string
  serverText: string
  serverVersion: number
}): CellPaint {
  const cell = state.cells.find(
    (item) => item.objectId === input.objectId
      && item.attribute === input.attribute
      && (item.language ?? '') === (input.language ?? ''),
  )
  if (cell) {
    return {
      text: cell.proposedText,
      drafted: true,
      held: false,
      originalText: cell.originalText,
    }
  }
  const committed = state.committed[input.objectId]
  if (committed && input.serverVersion < committed.version) {
    const text = committed.texts[input.columnId]
      ?? (input.language ? committed.texts[`${input.attribute}@${input.language}`] : undefined)
      ?? committed.texts[input.attribute]
    if (text !== undefined) return { text, drafted: false, held: true }
  }
  return { text: input.serverText, drafted: false, held: false }
}

export function overlayValues(objectId: string, serverValues: Json, serverVersion: number): Json {
  const committed = state.committed[objectId]
  const held = committed && serverVersion < committed.version ? committed.values : {}
  const draft = draftValues(objectId)
  const values: Json = { ...serverValues }
  for (const [key, value] of Object.entries({ ...held, ...draft })) {
    values[key] = mergeAttribute(values[key], value) as Json[string]
  }
  return values
}

export function displayOf(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return textValue(value)
}

export type ReviewCapability = {
  canSave: boolean
  canDiscard: boolean
  /** Empty when the action is allowed. */
  saveReason: string
  discardReason: string
}

export function reviewCapabilities(input: {
  principal: DraftPrincipal
  viaAgent: boolean
  open: boolean
  stale: boolean
  conflict: boolean
  validationErrors: string[]
  roleCanWrite: boolean
}): ReviewCapability {
  if (input.viaAgent || input.principal !== 'human') {
    return {
      canSave: false,
      canDiscard: false,
      saveReason: 'An agent cannot save a draft.',
      discardReason: 'An agent cannot discard a draft.',
    }
  }
  const discardReason = input.open ? '' : 'This draft is no longer open.'
  let saveReason = discardReason
  if (!input.roleCanWrite) saveReason = 'You do not have permission to save this draft.'
  else if (input.stale) saveReason = 'This object changed after the draft was started.'
  else if (input.conflict) saveReason = 'This draft conflicts with another pending change.'
  else if (input.validationErrors.length > 0) saveReason = input.validationErrors[0] ?? 'Fix the validation errors before saving.'
  return {
    canSave: saveReason === '',
    canDiscard: discardReason === '',
    saveReason,
    discardReason,
  }
}

export function roleCanWrite(role: string | undefined): boolean {
  if (!role) return true
  return role === 'admin' || role === 'editor'
}
