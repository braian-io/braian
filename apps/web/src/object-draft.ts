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

/** Shared table/Detail identity: one cell per object, attribute and language. */
export function draftCellKey(cell: { objectId: string; attribute: string; language?: string }): string {
  return `${cell.objectId}\n${cell.attribute}\n${cell.language ?? ''}`
}

export function objectDraftCells(objectId?: string): ObjectDraftCell[] {
  return objectId ? state.cells.filter((cell) => cell.objectId === objectId) : [...state.cells]
}

export function stageObjectCell(cell: ObjectDraftCell): void {
  const id = draftCellKey(cell)
  const previous = state.cells.find((item) => draftCellKey(item) === id)
  const originalText = previous?.originalText ?? cell.originalText
  const baseVersion = previous?.baseVersion ?? cell.baseVersion
  // Only the same language slot is replaced. Another language and every other
  // attribute stay untouched, so table and Detail can merge without loss.
  const rest = state.cells.filter((item) => draftCellKey(item) !== id)
  if (cell.proposedText === originalText) {
    emit({ ...state, cells: rest })
    return
  }
  emit({ ...state, cells: [...rest, { ...cell, originalText, baseVersion }] })
}

export function discardObjectDraft(objectId: string): void {
  emit({ ...state, cells: state.cells.filter((cell) => cell.objectId !== objectId) })
}

/** Drop only the cells in an exact snapshot, leaving edits made during an await. */
export function discardSubmittedCells(submitted: ObjectDraftCell[]): void {
  if (submitted.length === 0) return
  emit({
    ...state,
    cells: state.cells.filter((cell) => !submitted.some((saved) =>
      draftCellKey(saved) === draftCellKey(cell)
      && saved.proposedText === cell.proposedText
      && sameValue(saved.value, cell.value))),
  })
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

/**
 * Lossless merge: a language map keeps every language it does not touch and a
 * nested value keeps fields the draft did not mention. Arrays and primitives
 * replace as a whole.
 */
function mergeAttribute(current: unknown, next: unknown): unknown {
  if (
    current && next
    && typeof current === 'object' && typeof next === 'object'
    && !Array.isArray(current) && !Array.isArray(next)
  ) {
    const out: Json = { ...(current as Json) }
    for (const [key, value] of Object.entries(next as Json)) {
      out[key] = mergeAttribute(out[key], value) as Json[string]
    }
    return out
  }
  return next
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Json
    const right = b as Json
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
  }
  return false
}

function valuesFromCells(cells: ObjectDraftCell[]): Json {
  const values: Json = {}
  for (const cell of cells) {
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

export function draftValues(objectId: string): Json {
  return valuesFromCells(objectDraftCells(objectId))
}

/** The exact cells a Save is about to submit. Edits made during the await stay out. */
export function objectDraftSnapshot(objectIds: string[]): ObjectDraftCell[] {
  const scope = new Set(objectIds)
  return state.cells
    .filter((cell) => scope.has(cell.objectId))
    .map((cell) => ({ ...cell }))
}

/**
 * Remember the submitted version and clear only the submitted cells.
 *
 * A person can keep editing while the request is in flight. Those edits have a
 * different proposed value, so they survive; only the exact snapshot is cleared.
 * Committed values merge with an earlier save instead of dropping a newer hold.
 */
export function noteObjectDraftSaved(
  objectId: string,
  version: number,
  submitted: ObjectDraftCell[] = objectDraftCells(objectId),
): void {
  const cells = submitted.filter((cell) => cell.objectId === objectId)
  const texts: Record<string, string> = {}
  for (const cell of cells) {
    if (cell.language) {
      // A language cell must not claim the bare attribute key: the table can
      // show another language through a column without an explicit `@lang`.
      texts[`${cell.attribute}@${cell.language}`] = cell.proposedText
      continue
    }
    texts[cell.columnId] = cell.proposedText
    texts[cell.attribute] = cell.proposedText
  }
  const previous = state.committed[objectId]
  const committedVersion = previous ? Math.max(previous.version, version) : version
  const committedValues = previous
    ? (mergeAttribute(previous.values, valuesFromCells(cells)) as Json)
    : valuesFromCells(cells)
  const committed = {
    ...state.committed,
    [objectId]: {
      version: committedVersion,
      texts: { ...(previous?.texts ?? {}), ...texts },
      values: committedValues,
    },
  }
  const submittedByKey = new Map(cells.map((cell) => [draftCellKey(cell), cell]))
  const keep = state.cells.flatMap((cell) => {
    if (cell.objectId !== objectId) return [cell]
    const saved = submittedByKey.get(draftCellKey(cell))
    if (saved && saved.proposedText === cell.proposedText && sameValue(saved.value, cell.value)) {
      return []
    }
    // An edit made while the request was in flight was based on the revision
    // before the save. Rebase it onto the acknowledged revision (and onto the
    // value that just landed) so the next Save is not rejected as stale.
    return [{
      ...cell,
      baseVersion: Math.max(cell.baseVersion, committedVersion),
      originalText: saved ? saved.proposedText : cell.originalText,
    }]
  })
  emit({ cells: keep, committed })
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
    // Never fall back to the bare attribute for a language cell: another
    // language saved earlier could otherwise appear in this column.
    const text = input.language
      ? committed.texts[`${input.attribute}@${input.language}`] ?? committed.texts[input.columnId]
      : committed.texts[input.columnId] ?? committed.texts[input.attribute]
    if (text !== undefined) return { text, drafted: false, held: true }
  }
  return { text: input.serverText, drafted: false, held: false }
}

/**
 * What reopening a cell editor starts from: the current draft (or a committed
 * value a stale read has not caught up to), not the server text behind it.
 */
export function draftEditorSeed(input: {
  objectId: string
  columnId: string
  attribute: string
  language?: string
  serverText: string
  serverVersion: number
}): { text: string; originalText: string } | null {
  const painted = paintObjectCell(input)
  if (!painted.drafted && !painted.held) return null
  return {
    text: painted.text,
    originalText: painted.drafted ? (painted.originalText ?? painted.text) : painted.text,
  }
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
