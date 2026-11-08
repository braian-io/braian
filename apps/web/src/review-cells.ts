import { textValue, type Json } from './api'

/** Create, update, or delete. Originals come from the base snapshot, never a later object. */
export type ReviewOp = 'create' | 'update' | 'delete'

export type ReviewCell = {
  id: string
  attribute: string
  language?: string
  op: ReviewOp
  originalKnown: boolean
  originalText: string
  proposedText: string
  proposed: unknown
}

export function reviewOperation(row: { object_id?: unknown; patch?: unknown }): ReviewOp {
  const patch = (row.patch && typeof row.patch === 'object' ? row.patch : {}) as Json
  if (patch.op === 'delete' || patch.delete === true) return 'delete'
  if (!row.object_id) return 'create'
  return 'update'
}

function asRecord(value: unknown): Json | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Json
}

export function cellId(attribute: string, language?: string): string {
  return language ? `${attribute}@${language}` : attribute
}

function display(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return textValue(value)
}

/**
 * Cells for one proposal row.
 *
 * `baseValues` is the object at `base_version`. `liveValues` is accepted and
 * ignored so a caller cannot accidentally diff against the latest object.
 */
export function reviewCells(input: {
  patch: unknown
  baseValues: Json | null | undefined
  liveValues?: Json | null
  objectId?: string | null
}): ReviewCell[] {
  void input.liveValues
  const op = reviewOperation({ object_id: input.objectId, patch: input.patch })
  const patch = asRecord(input.patch) ?? {}
  if (op === 'delete') {
    return [{
      id: '$delete',
      attribute: '$delete',
      op,
      originalKnown: input.baseValues != null,
      originalText: '',
      proposedText: '',
      proposed: null,
    }]
  }
  const proposed = asRecord(patch.values) ?? {}
  const base = input.baseValues ?? null
  const cells: ReviewCell[] = []
  for (const [attribute, after] of Object.entries(proposed)) {
    const before = base ? base[attribute] : undefined
    const afterMap = asRecord(after)
    const beforeMap = asRecord(before)
    if (afterMap && (beforeMap || before == null)) {
      for (const [language, languageValue] of Object.entries(afterMap)) {
        const original = beforeMap ? beforeMap[language] : undefined
        const originalText = display(original)
        const proposedText = display(languageValue)
        if (base && originalText === proposedText) continue
        cells.push({
          id: cellId(attribute, language),
          attribute,
          language,
          op,
          originalKnown: base != null,
          originalText: base ? originalText : '',
          proposedText,
          proposed: languageValue,
        })
      }
      continue
    }
    const originalText = display(before)
    const proposedText = display(after)
    if (base && originalText === proposedText) continue
    cells.push({
      id: cellId(attribute),
      attribute,
      op,
      originalKnown: base != null,
      originalText: base ? originalText : '',
      proposedText,
      proposed: after,
    })
  }
  return cells
}

export type IndexedProposalCell = ReviewCell & {
  proposalId: string
  rowId: string
  objectId: string
  stale: boolean
  staleReason: string
  conflict: boolean
}

/** Open object rows, keyed by `objectId`, then cell id. Import sessions stay on the import draft. */
export function indexProposalCells(proposals: Json[]): Map<string, IndexedProposalCell[]> {
  const byObject = new Map<string, IndexedProposalCell[]>()
  for (const proposal of proposals) {
    if (String(proposal.status ?? '') !== 'open') continue
    if (proposal.session_id) continue
    const stale = Boolean(proposal.stale)
    const staleReason = String(proposal.stale_reason ?? '')
    const conflict = Boolean(proposal.conflict)
    const rows = (proposal.rows as Json[] | undefined) ?? []
    for (const row of rows) {
      if (String(row.status ?? '') !== 'pending') continue
      const typeKey = String(row.type_key ?? '')
      if (typeKey === 'model' || typeKey === 'assortment') continue
      const objectId = String(row.object_id ?? '')
      if (!objectId) continue
      const cells = reviewCells({
        patch: row.patch,
        baseValues: asRecord(row.base_values),
        liveValues: null,
        objectId,
      })
      const list = byObject.get(objectId) ?? []
      for (const cell of cells) {
        list.push({
          ...cell,
          proposalId: String(proposal.id ?? ''),
          rowId: String(row.id ?? ''),
          objectId,
          stale: stale || Boolean(row.conflict),
          staleReason,
          conflict: conflict || Boolean(row.conflict),
        })
      }
      if (reviewOperation(row) === 'delete' && cells.length === 0) {
        list.push({
          id: '$delete',
          attribute: '$delete',
          op: 'delete',
          originalKnown: asRecord(row.base_values) != null,
          originalText: '',
          proposedText: '',
          proposed: null,
          proposalId: String(proposal.id ?? ''),
          rowId: String(row.id ?? ''),
          objectId,
          stale,
          staleReason,
          conflict,
        })
      }
      byObject.set(objectId, list)
    }
  }
  return byObject
}

export type ProposalMembership = {
  proposalId: string
  /** Every object id of a pending ordinary update row, including objects outside the current view. */
  objectIds: string[]
  /**
   * True when a pending row cannot be reviewed as an ordinary object cell:
   * create (no object), delete, model, or assortment. Discarding the whole
   * proposal would destroy that unreviewed row, so callers must preserve it.
   */
  unmapped: boolean
}

/**
 * Complete pending membership for every open object proposal.
 *
 * `indexProposalCells` intentionally drops rows that cannot be painted as a
 * cell. Discard needs the opposite: every pending row, including objects
 * outside the caller's visible scope and unmapped create/delete/model rows.
 * A missing or partial membership must never authorize a whole-proposal
 * discard, because the backend closes the entire proposal.
 */
export function proposalMemberships(proposals: Json[]): Map<string, ProposalMembership> {
  const out = new Map<string, ProposalMembership>()
  for (const proposal of proposals) {
    if (String(proposal.status ?? '') !== 'open') continue
    if (proposal.session_id) continue
    const proposalId = String(proposal.id ?? '')
    if (!proposalId) continue
    const objects = new Set<string>()
    let unmapped = false
    const rows = (proposal.rows as Json[] | undefined) ?? []
    for (const row of rows) {
      if (String(row.status ?? '') !== 'pending') continue
      const typeKey = String(row.type_key ?? '')
      const objectId = String(row.object_id ?? '')
      if (typeKey === 'model' || typeKey === 'assortment') {
        unmapped = true
        if (objectId) objects.add(objectId)
        continue
      }
      if (!objectId) {
        unmapped = true
        continue
      }
      objects.add(objectId)
      if (reviewOperation(row) === 'delete') unmapped = true
    }
    out.set(proposalId, { proposalId, objectIds: [...objects], unmapped })
  }
  return out
}

export type UnmappedProposal = {
  proposalId: string
  title: string
  /** `create` and `delete` have no safe inline object cell; `model` stays on its own surface. */
  reason: 'create' | 'delete' | 'model'
}

/**
 * Open proposals that cannot be painted as an ordinary object cell: a create
 * row has no object, a delete row has no value column, and a model row belongs
 * to the model review. Callers must still show a review path for them.
 */
export function unmappedProposals(proposals: Json[]): UnmappedProposal[] {
  const out = new Map<string, UnmappedProposal>()
  for (const proposal of proposals) {
    if (String(proposal.status ?? '') !== 'open') continue
    if (proposal.session_id) continue
    const proposalId = String(proposal.id ?? '')
    if (!proposalId) continue
    const title = String(proposal.title ?? '')
    const rows = (proposal.rows as Json[] | undefined) ?? []
    for (const row of rows) {
      if (String(row.status ?? '') !== 'pending') continue
      const typeKey = String(row.type_key ?? '')
      if (typeKey === 'model' || typeKey === 'assortment') {
        out.set(proposalId, { proposalId, title, reason: 'model' })
        continue
      }
      if (!row.object_id) {
        out.set(proposalId, { proposalId, title, reason: 'create' })
        continue
      }
      if (reviewOperation(row) === 'delete') {
        out.set(proposalId, { proposalId, title, reason: 'delete' })
      }
    }
  }
  return [...out.values()]
}

export function importErrorLines(errors: unknown): string[] {
  if (!Array.isArray(errors)) return []
  return errors.flatMap((item) => {
    if (typeof item === 'string' && item) return [item]
    if (item && typeof item === 'object' && 'message' in item) {
      const message = String((item as { message?: unknown }).message ?? '')
      return message ? [message] : []
    }
    return []
  })
}

/** Same content key as the server projection. Order changes do not rename a distinct step. */
export function modelStepKey(step: Json): string {
  const keys = Object.keys(step).sort()
  let out = ''
  for (const key of keys) {
    out += `${key}=${JSON.stringify(step[key])}\u0001`
  }
  return out
}

export function modelStepKeys(steps: Json[]): string[] {
  const seen = new Map<string, number>()
  return steps.map((step) => {
    const base = modelStepKey(step)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}#${count}`
  })
}
