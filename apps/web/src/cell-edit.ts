import { textValue, type Json } from './api'
import { factorsForFamily, unitsForFamily } from './fields/catalog'
import { parseColumnId } from './fields/columns'
import { convertMeasure } from './fields/qualifiers'
import { formatConvertedMeasure, formatMeasureEditNumber, formatMeasureStorageNumber, parseDecimalInput } from './format'
import { attributeByKey, attributeIndexField } from './index-fields'

/** True when a cell editor draft should be PATCH'ed. Esc / unchanged must return false. */
export function cellEditShouldPatch(original: string, nextText: string): boolean {
  return nextText !== original
}

export type MeasureEditContext = {
  stored: { value: number; unit: string } | null
  displayUnit: string
  factors: Record<string, number>
  /** Stored unit on the object; edits convert back into this unit. */
  storageUnit: string
}

export type InlineMeasureEdit = MeasureEditContext & {
  /** Column qualifier pins the unit (label only). */
  unitLocked: boolean
  unitOptions: string[]
}

export type MeasureEditDraft = {
  valueText: string
  unit: string
}

export type MeasureCommitResult =
  | { ok: true; stored: { value: string; unit: string }; proposedText: string; unchanged: boolean }
  | { ok: false; reason: 'empty' | 'invalid' }

/** Stored measure from a Typesense row (`a_<id>` + `a_<id>__unit`). */
export function readStoredMeasure(
  doc: Json | undefined,
  defs: Json | undefined,
  attrKey: string,
): { value: number; unit: string } | null {
  const attr = attributeByKey(defs, attrKey)
  if (!attr) return null
  const kind = attr.kind as Json | undefined
  if (String(kind?.type ?? '') !== 'number' || !kind?.unit_family) return null
  const id = String(attr.id ?? '')
  const field = id ? attributeIndexField(id) : `a_${attrKey}`
  const rawValue = doc?.[field]
  const unit = textValue(doc?.[`${field}__unit`])
  if (!unit) return null
  const value = typeof rawValue === 'number'
    ? rawValue
    : Number(String(rawValue ?? '').replaceAll(',', ''))
  if (!Number.isFinite(value)) return null
  return { value, unit }
}

function measureFamily(defs: Json | undefined, attrKey: string): string | undefined {
  const attr = attributeByKey(defs, attrKey)
  const kind = attr?.kind as Json | undefined
  if (String(kind?.type ?? '') !== 'number' || !kind?.unit_family) return undefined
  return String(kind.unit_family)
}

/** Context for inline edit of a measured attribute (with or without a display-unit qualifier). */
export function inlineMeasureEditContext(
  columnId: string,
  doc: Json | undefined,
  defs: Json | undefined,
): InlineMeasureEdit | null {
  const { path, qualifiers } = parseColumnId(columnId)
  if (path.includes('.')) return null
  if (qualifiers.some((q) => q.kind === 'cardinality')) return null
  const attrKey = columnBaseKey(columnId)
  const family = measureFamily(defs, attrKey)
  if (!family) return null
  const factors = factorsForFamily(defs ?? {}, family)
  const unitOptions = unitsForFamily(defs ?? {}, family)
  const stored = readStoredMeasure(doc, defs, attrKey)
  const storageUnit = stored?.unit ?? unitOptions[0] ?? ''
  const unitQ = qualifiers.find((q) => q.kind === 'unit')
  if (unitQ) {
    return {
      stored,
      displayUnit: unitQ.optionId,
      factors,
      storageUnit,
      unitLocked: true,
      unitOptions: [unitQ.optionId],
    }
  }
  if (qualifiers.length > 0) return null
  return {
    stored,
    displayUnit: stored ? stored.unit : storageUnit,
    factors,
    storageUnit,
    unitLocked: false,
    unitOptions,
  }
}

/** @deprecated Use {@link inlineMeasureEditContext}. */
export function measureEditContext(
  columnId: string,
  doc: Json | undefined,
  defs: Json | undefined,
): MeasureEditContext | null {
  const ctx = inlineMeasureEditContext(columnId, doc, defs)
  if (!ctx?.unitLocked) return ctx && ctx.stored ? ctx : null
  return ctx.stored ? ctx : null
}

/** Parse a number from inline measure text (`485.18 kcal` → 485.18). */
export function parseMeasureInput(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const bare = trimmed.replace(/\s*[a-zA-Z°%µ].*$/u, '').trim()
  return parseDecimalInput(bare)
}

export function measureEditInitialDraft(ctx: MeasureEditContext): MeasureEditDraft {
  if (!ctx.stored) {
    return { valueText: '', unit: ctx.displayUnit }
  }
  const converted = convertMeasure(ctx.stored.value, ctx.stored.unit, ctx.displayUnit, ctx.factors)
  return { valueText: formatMeasureEditNumber(converted), unit: ctx.displayUnit }
}

function roundDisplayMeasure(value: number): number {
  return Math.round(value * 100) / 100
}

/** Converted measure text as shown in the grid for this column. */
export function displayMeasureText(ctx: MeasureEditContext): string {
  if (!ctx.stored) return ''
  const converted = convertMeasure(ctx.stored.value, ctx.stored.unit, ctx.displayUnit, ctx.factors)
  return formatConvertedMeasure(converted, ctx.displayUnit)
}

function roundedDisplayOfStored(ctx: MeasureEditContext): number | null {
  if (!ctx.stored) return null
  const displayValue = convertMeasure(ctx.stored.value, ctx.stored.unit, ctx.displayUnit, ctx.factors)
  return roundDisplayMeasure(displayValue)
}

function storedFromDraft(ctx: MeasureEditContext, draft: MeasureEditDraft): { value: string; unit: string } | null {
  const parsed = parseDecimalInput(draft.valueText)
  if (parsed == null) return null
  const storedNum = convertMeasure(parsed, draft.unit, ctx.storageUnit, ctx.factors)
  if (!Number.isFinite(storedNum)) return null
  return { value: formatMeasureStorageNumber(storedNum), unit: ctx.storageUnit }
}

/** Whether a measure draft would persist the same stored value as on the object. */
export function measureEditStoredUnchanged(
  ctx: MeasureEditContext,
  stored: { value: string; unit: string },
): boolean {
  if (!ctx.stored) return false
  const nextNum = Number(stored.value)
  if (!Number.isFinite(nextNum)) return false
  return (
    stored.unit === ctx.stored.unit
    && formatMeasureStorageNumber(nextNum) === formatMeasureStorageNumber(ctx.stored.value)
  )
}

function normalizeMeasureDraftText(text: string): string {
  return text.trim().replace(/[\s\u00A0\u202F]+/g, ' ')
}

/** Whether the draft text and unit match the seeded editor state (display unit, unmodified). */
export function measureEditDraftUnchanged(ctx: MeasureEditContext, draft: MeasureEditDraft): boolean {
  const initial = measureEditInitialDraft(ctx)
  return (
    draft.unit === initial.unit
    && normalizeMeasureDraftText(draft.valueText) === normalizeMeasureDraftText(initial.valueText)
  )
}

export function commitMeasureEdit(ctx: MeasureEditContext, draft: MeasureEditDraft): MeasureCommitResult {
  const trimmed = draft.valueText.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  const stored = storedFromDraft(ctx, draft)
  if (!stored) return { ok: false, reason: 'invalid' }
  const unchanged = measureEditStoredUnchanged(ctx, stored) || measureEditDraftUnchanged(ctx, draft)
  const proposedText = formatConvertedMeasure(
    convertMeasure(Number(stored.value), stored.unit, ctx.displayUnit, ctx.factors),
    ctx.displayUnit,
  )
  return { ok: true, stored, proposedText, unchanged }
}

/**
 * Whether a converted measure cell should PATCH.
 * Ignores display rounding: unchanged rounded text must not write.
 */
export function measureEditShouldPatch(ctx: MeasureEditContext, draft: string): boolean {
  const trimmed = draft.trim()
  const displayed = displayMeasureText(ctx).trim()
  if (trimmed === displayed) return false
  const parsed = parseMeasureInput(draft)
  if (parsed == null) return trimmed !== displayed
  const bare = trimmed.replace(/\s*[a-zA-Z°%µ].*$/u, '').trim()
  const measureDraft: MeasureEditDraft = { valueText: bare, unit: ctx.displayUnit }
  const result = commitMeasureEdit(ctx, measureDraft)
  if (result.ok && result.unchanged) return false
  const roundedDisplay = roundedDisplayOfStored(ctx)
  if (roundedDisplay == null) return true
  return roundDisplayMeasure(parsed) !== roundedDisplay
}

/** Map display-unit draft back to the stored unit without display rounding. */
export function measureEditStoredValue(
  ctx: MeasureEditContext,
  draft: string,
): { value: string; unit: string } | null {
  const parsed = parseMeasureInput(draft)
  if (parsed == null) return null
  const storedNum = convertMeasure(parsed, ctx.displayUnit, ctx.storageUnit, ctx.factors)
  if (!Number.isFinite(storedNum)) return null
  return { value: formatMeasureStorageNumber(storedNum), unit: ctx.storageUnit }
}

/** Proposed grid text after a measure edit (display unit, rounded for paint only). */
export function measureEditProposedText(ctx: MeasureEditContext, draft: string): string {
  const stored = measureEditStoredValue(ctx, draft)
  if (!stored) return draft.trim()
  const converted = convertMeasure(Number(stored.value), stored.unit, ctx.displayUnit, ctx.factors)
  return formatConvertedMeasure(converted, ctx.displayUnit)
}

/**
 * Build PATCH `values` for an inline cell edit.
 *
 * Language-dependent attributes (e.g. `name`) must be sent as
 * `{ [attrKey]: { [lang]: text } }` — the same shape the detail Editor uses —
 * even when the grid column id has no `@lang` suffix. Bare strings are rejected
 * by the API and leave the old value on screen after refresh.
 */
export function cellEditValuesBody(args: {
  attrKey: string
  nextText: string
  /** Language from a column id like `name@en` or `description@sv`. */
  columnLanguage?: string
  languageDependent: boolean
  uiLanguage: string
}): { [key: string]: unknown } {
  if (args.columnLanguage) {
    return { [args.attrKey]: { [args.columnLanguage]: args.nextText } }
  }
  if (args.languageDependent) {
    return { [args.attrKey]: { [args.uiLanguage]: args.nextText } }
  }
  return { [args.attrKey]: args.nextText }
}

/** Path / qualifier-free column key (`name@en` → `name`). */
export function columnBaseKey(columnId: string): string {
  const path = parseColumnId(columnId).path
  return (path.split('@')[0] ?? path).split('.')[0] ?? path
}

/** System / identity columns that must never open an inline editor. */
const READ_ONLY_COLUMN_BASES = new Set([
  'type',
  'version',
  'key',
  'number',
  'created',
  'created_at',
  'updated',
  'updated_at',
  'updated_by',
])

/**
 * Whether ObjectTable may start an inline edit for this column id.
 * Hops and system fields are blocked; value_list columns (e.g. Status) stay editable
 * so the Select editor can open.
 */
export function isEditableColumn(columnId: string, owned?: ReadonlySet<string>): boolean {
  const path = parseColumnId(columnId).path
  if (path.includes('>')) return false
  // A measured value/unit part needs both halves in one write; the combined
  // column covers editing for now, so the parts stay display-only.
  const part = path.includes('.') ? path.slice(path.indexOf('.') + 1).split('@')[0] : ''
  if (part === 'value' || part === 'unit') return false
  const base = columnBaseKey(columnId)
  if (READ_ONLY_COLUMN_BASES.has(base)) return false
  if (owned?.has(base)) return false
  return true
}

type AttrKind = { type?: unknown; list?: unknown }

/** Value-list / lifecycle list key for a column, or null when the cell is free text. */
export function valueListKeyForColumn(
  columnId: string,
  defs: { attributes?: Array<{ key?: unknown; kind?: unknown }> } | null | undefined,
): string | null {
  const base = columnBaseKey(columnId)
  const attributes = defs?.attributes ?? []
  const attr = attributes.find((item) => String(item.key ?? '') === base)
  const kind = (attr?.kind && typeof attr.kind === 'object' ? attr.kind : {}) as AttrKind
  const type = String(kind.type ?? '')
  if (type === 'value_list' || type === 'lifecycle') {
    return String(kind.list ?? base)
  }
  return null
}

/** True when the event target (or document focus) is inside an inline `.cell-editor` or open Select. */
export function isTextEditingTarget(event: { target: EventTarget | null }): boolean {
  const hit = (node: Element | null) =>
    Boolean(
      node
      && (node.closest('.cell-editor')
        || node.closest('.cell-measure-editor')
        || node.closest('.select-content')
        || node.closest('[data-radix-select-content]')),
    )
  if (event.target instanceof Element && hit(event.target)) return true
  if (typeof document !== 'undefined') {
    const active = document.activeElement
    if (active instanceof Element && hit(active)) return true
  }
  return false
}

/**
 * True while ObjectTable has an open cell editor (`editingCell`) or focus is in `.cell-editor`.
 * Call first in grid / global keydown handlers so Home/End/Ctrl+K/etc. never steal keys from the caret.
 */
export function isEditingCell(
  event: { target: EventTarget | null },
  editingCell?: { rowId: string; columnId: string } | null,
): boolean {
  return Boolean(editingCell) || isTextEditingTarget(event)
}

/** Outcome when seeding an inline cell editor from row / path-values data. */
export type CellEditInitial =
  | { ok: true; text: string }
  | { ok: false; reason: 'unloaded' }

/**
 * Resolve the draft for an inline cell editor.
 *
 * Path-values columns (Description, hops, …) must not open from the painted
 * loading placeholder — that copies "" into the draft and can PATCH an empty
 * string over a real value. Block until the path-values batch has an entry for
 * the cell; then seed from that data (or from fallbackText for indexed columns).
 */
export function resolveCellEditInitial(args: {
  needsPathValues: boolean
  /** First path-values response for this page is still outstanding. */
  pathValuesPending: boolean
  /** Query has produced a data object (may be empty maps). */
  pathValuesHasData: boolean
  /**
   * Values for this row+column from the path-values response.
   * `undefined` = key missing (row not in batch yet); `[]` = loaded empty.
   */
  pathValuesForCell: string[] | undefined
  /** Indexed / Typesense text when the column does not need path-values. */
  fallbackText: string
  /** Optional formatter for loaded path-values (defaults to join with ", "). */
  formatPathValues?: (values: string[]) => string
}): CellEditInitial {
  if (!args.needsPathValues) {
    return { ok: true, text: args.fallbackText }
  }
  if (args.pathValuesPending || !args.pathValuesHasData) {
    return { ok: false, reason: 'unloaded' }
  }
  if (args.pathValuesForCell === undefined) {
    return { ok: false, reason: 'unloaded' }
  }
  const format =
    args.formatPathValues
    ?? ((values: string[]) => values.map((item) => String(item ?? '').trim()).filter(Boolean).join(', '))
  return { ok: true, text: format(args.pathValuesForCell) }
}
