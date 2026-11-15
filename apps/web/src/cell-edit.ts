import { textValue, type Json } from './api'
import { factorsForFamily } from './fields/catalog'
import { parseColumnId } from './fields/columns'
import { convertMeasure } from './fields/qualifiers'
import { formatConvertedMeasure } from './format'
import { attributeByKey, attributeIndexField } from './index-fields'

/** True when a cell editor draft should be PATCH'ed. Esc / unchanged must return false. */
export function cellEditShouldPatch(original: string, nextText: string): boolean {
  return nextText !== original
}

export type MeasureEditContext = {
  stored: { value: number; unit: string }
  displayUnit: string
  factors: Record<string, number>
}

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

/** Context for inline edit of a column with a display-unit qualifier (#unit:kcal, …). */
export function measureEditContext(
  columnId: string,
  doc: Json | undefined,
  defs: Json | undefined,
): MeasureEditContext | null {
  const { path, qualifiers } = parseColumnId(columnId)
  if (path.includes('.')) return null
  const unitQ = qualifiers.find((q) => q.kind === 'unit')
  if (!unitQ) return null
  const attrKey = columnBaseKey(columnId)
  const stored = readStoredMeasure(doc, defs, attrKey)
  if (!stored) return null
  const attr = attributeByKey(defs, attrKey)
  const kind = attr?.kind as Json | undefined
  const family = kind?.unit_family != null ? String(kind.unit_family) : undefined
  return {
    stored,
    displayUnit: unitQ.optionId,
    factors: factorsForFamily(defs ?? {}, family),
  }
}

/** Parse a number from inline measure text (`485.18 kcal` → 485.18). */
export function parseMeasureInput(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const match = trimmed.replaceAll(',', '').match(/^(-?[\d.]+)/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function roundDisplayMeasure(value: number): number {
  return Math.round(value * 100) / 100
}

/** Converted measure text as shown in the grid for this column. */
export function displayMeasureText(ctx: MeasureEditContext): string {
  const converted = convertMeasure(ctx.stored.value, ctx.stored.unit, ctx.displayUnit, ctx.factors)
  return formatConvertedMeasure(converted, ctx.displayUnit)
}

/**
 * Whether a converted measure cell should PATCH.
 * Ignores display rounding: unchanged rounded text must not write.
 */
export function measureEditShouldPatch(ctx: MeasureEditContext, draft: string): boolean {
  const parsed = parseMeasureInput(draft)
  const displayValue = convertMeasure(ctx.stored.value, ctx.stored.unit, ctx.displayUnit, ctx.factors)
  const roundedDisplay = roundDisplayMeasure(displayValue)
  if (parsed == null) return draft.trim() !== displayMeasureText(ctx).trim()
  return roundDisplayMeasure(parsed) !== roundedDisplay
}

/** Map display-unit draft back to the stored unit without display rounding. */
export function measureEditStoredValue(
  ctx: MeasureEditContext,
  draft: string,
): { value: string; unit: string } | null {
  const parsed = parseMeasureInput(draft)
  if (parsed == null) return null
  const storedNum = convertMeasure(parsed, ctx.displayUnit, ctx.stored.unit, ctx.factors)
  if (!Number.isFinite(storedNum)) return null
  return { value: String(storedNum), unit: ctx.stored.unit }
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
