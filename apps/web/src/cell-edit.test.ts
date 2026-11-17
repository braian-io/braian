// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  cellEditShouldPatch,
  cellEditValuesBody,
  columnBaseKey,
  commitMeasureEdit,
  type MeasureEditContext,
  displayMeasureText,
  inlineMeasureEditContext,
  isEditableColumn,
  isEditingCell,
  isTextEditingTarget,
  measureEditContext,
  measureEditInitialDraft,
  measureEditShouldPatch,
  measureEditStoredUnchanged,
  measureEditStoredValue,
  resolveCellEditInitial,
  valueListKeyForColumn,
} from './cell-edit'

describe('cellEditShouldPatch', () => {
  it('returns false for identical strings (Enter/blur must not PATCH)', () => {
    expect(cellEditShouldPatch('hello', 'hello')).toBe(false)
  })

  it('returns false when Esc restores the original after a draft clear', () => {
    const original = 'seed text'
    const draftCleared = ''
    expect(cellEditShouldPatch(original, draftCleared)).toBe(true)
    // cancel path commits original again → no PATCH
    expect(cellEditShouldPatch(original, original)).toBe(false)
  })

  it('returns true only when the value actually changed', () => {
    expect(cellEditShouldPatch('a', 'b')).toBe(true)
    expect(cellEditShouldPatch('', 'x')).toBe(true)
  })
})

describe('cellEditValuesBody', () => {
  it('wraps language_dependent attrs without @lang using uiLanguage (name fix)', () => {
    expect(
      cellEditValuesBody({
        attrKey: 'name',
        nextText: 'Aged cheddar',
        languageDependent: true,
        uiLanguage: 'en',
      }),
    ).toEqual({ name: { en: 'Aged cheddar' } })
  })

  it('keeps an explicit @lang from the column id', () => {
    expect(
      cellEditValuesBody({
        attrKey: 'description',
        nextText: 'Hej',
        columnLanguage: 'sv',
        languageDependent: true,
        uiLanguage: 'en',
      }),
    ).toEqual({ description: { sv: 'Hej' } })
  })

  it('sends a bare string for non-localized attributes', () => {
    expect(
      cellEditValuesBody({
        attrKey: 'brand',
        nextText: 'Acme',
        languageDependent: false,
        uiLanguage: 'en',
      }),
    ).toEqual({ brand: 'Acme' })
  })

  it('is red against the old bare-string shape for name', () => {
    // Old commitCellEdit used { name: text } when column id had no @lang.
    const oldWrong = { name: 'Aged cheddar' }
    const fixed = cellEditValuesBody({
      attrKey: 'name',
      nextText: 'Aged cheddar',
      languageDependent: true,
      uiLanguage: 'en',
    })
    expect(oldWrong).not.toEqual(fixed)
    expect(fixed).toEqual({ name: { en: 'Aged cheddar' } })
  })
})

describe('isTextEditingTarget / isEditingCell', () => {
  it('is true when the event target is inside .cell-editor', () => {
    const wrap = document.createElement('div')
    wrap.className = 'cell-editor'
    const input = document.createElement('input')
    wrap.appendChild(input)
    document.body.appendChild(wrap)
    expect(isTextEditingTarget({ target: input })).toBe(true)
    expect(isEditingCell({ target: input })).toBe(true)
    wrap.remove()
  })

  it('is true when document.activeElement is inside .cell-editor even if target is not', () => {
    const wrap = document.createElement('div')
    wrap.className = 'cell-editor'
    const input = document.createElement('input')
    wrap.appendChild(input)
    document.body.appendChild(wrap)
    input.focus()
    expect(isTextEditingTarget({ target: document.body })).toBe(true)
    wrap.remove()
  })

  it('is false for ordinary grid targets without editingCell', () => {
    const cell = document.createElement('div')
    cell.className = 'active-cell'
    document.body.appendChild(cell)
    expect(isTextEditingTarget({ target: cell })).toBe(false)
    expect(isEditingCell({ target: cell }, null)).toBe(false)
    cell.remove()
  })

  it('is true when editingCell is set even if focus is elsewhere', () => {
    const cell = document.createElement('div')
    document.body.appendChild(cell)
    expect(isEditingCell({ target: cell }, { rowId: 'r1', columnId: 'name' })).toBe(true)
    cell.remove()
  })
})


describe('isEditableColumn', () => {
  it('blocks hops and system columns', () => {
    expect(isEditableColumn('supplier>name')).toBe(false)
    expect(isEditableColumn('type')).toBe(false)
    expect(isEditableColumn('version')).toBe(false)
    expect(isEditableColumn('key')).toBe(false)
    expect(isEditableColumn('number')).toBe(false)
    expect(isEditableColumn('created_at')).toBe(false)
    expect(isEditableColumn('updated_at')).toBe(false)
    expect(isEditableColumn('updated_by')).toBe(false)
  })

  it('allows name and status (value_list) columns', () => {
    expect(isEditableColumn('name')).toBe(true)
    expect(isEditableColumn('name@en')).toBe(true)
    expect(isEditableColumn('status')).toBe(true)
    expect(isEditableColumn('brand', new Set(['brand']))).toBe(false)
    expect(isEditableColumn('name', new Set(['brand']))).toBe(true)
  })

  it('keeps measured value and unit parts display-only', () => {
    expect(isEditableColumn('fat_content.value')).toBe(false)
    expect(isEditableColumn('fat_content.unit')).toBe(false)
    expect(isEditableColumn('allergens.code')).toBe(true)
  })
})

describe('valueListKeyForColumn', () => {
  const defs = {
    attributes: [
      { key: 'status', kind: { type: 'value_list', list: 'status' } },
      { key: 'name', kind: { type: 'text' } },
      { key: 'lifecycle', kind: { type: 'lifecycle', list: 'product_life' } },
    ],
  }

  it('returns the list key for value_list / lifecycle attrs', () => {
    expect(valueListKeyForColumn('status', defs)).toBe('status')
    expect(valueListKeyForColumn('lifecycle', defs)).toBe('product_life')
  })

  it('returns null for free-text columns', () => {
    expect(valueListKeyForColumn('name', defs)).toBeNull()
    expect(columnBaseKey('name@en')).toBe('name')
  })
})


const energyEnergyDefs = {
  attributes: [
    {
      id: '018f0000-0000-7000-8000-000000000099',
      key: 'energy',
      kind: { type: 'number', unit_family: '018f0000-0000-7000-8000-000000000014' },
    },
  ],
  unit_families: [
    {
      id: '018f0000-0000-7000-8000-000000000014',
      key: 'energy',
      units: [
        { code: 'kJ', factor: '1' },
        { code: 'kcal', factor: '4.184' },
      ],
    },
  ],
}

describe('measure inline edit', () => {
  const energyDoc = {
    a_018f0000_0000_7000_8000_000000000099: '2030',
    a_018f0000_0000_7000_8000_000000000099__unit: 'kJ',
  }
  const columnId = 'energy#unit:kcal'

  it('skips PATCH when the rounded display text is unchanged', () => {
    const ctx = measureEditContext(columnId, energyDoc, energyEnergyDefs)
    expect(ctx).not.toBeNull()
    const shown = displayMeasureText(ctx!)
    expect(shown).toMatch(/kcal$/)
    expect(measureEditShouldPatch(ctx!, shown)).toBe(false)
    expect(measureEditShouldPatch(ctx!, shown.replace(' kcal', ''))).toBe(false)
  })

  it('converts a typed display value back to the stored unit without display rounding', () => {
    const ctx = measureEditContext(columnId, energyDoc, energyEnergyDefs)
    expect(ctx).not.toBeNull()
    const stored = measureEditStoredValue(ctx!, '500 kcal')
    expect(stored).toEqual({ value: '2092', unit: 'kJ' })
    expect(measureEditShouldPatch(ctx!, '500 kcal')).toBe(true)
  })

  it('commits a structured draft with a decimal comma', () => {
    const ctx = inlineMeasureEditContext(columnId, energyDoc, energyEnergyDefs)
    expect(ctx).not.toBeNull()
    const draft = measureEditInitialDraft(ctx!)
    const result = commitMeasureEdit(ctx!, { ...draft, valueText: '1,5' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.stored.value).toBeTruthy()
    }
  })

  it('rejects invalid and empty measure drafts visibly', () => {
    const ctx = inlineMeasureEditContext(columnId, energyDoc, energyEnergyDefs)
    expect(ctx).not.toBeNull()
    expect(commitMeasureEdit(ctx!, { valueText: '', unit: 'kcal' })).toEqual({ ok: false, reason: 'empty' })
    expect(commitMeasureEdit(ctx!, { valueText: 'abc', unit: 'kcal' })).toEqual({ ok: false, reason: 'invalid' })
  })

  it('seeds and commits 2000 without thousands grouping', () => {
    const doc = {
      a_018f0000_0000_7000_8000_000000000099: '2000',
      a_018f0000_0000_7000_8000_000000000099__unit: 'kJ',
    }
    const kjColumn = 'energy#unit:kJ'
    const ctx = inlineMeasureEditContext(kjColumn, doc, energyEnergyDefs)
    expect(ctx).not.toBeNull()
    expect(measureEditInitialDraft(ctx!)).toEqual({ valueText: '2000', unit: 'kJ' })
    const unchanged = commitMeasureEdit(ctx!, { valueText: '2000', unit: 'kJ' })
    expect(unchanged.ok).toBe(true)
    if (unchanged.ok) {
      expect(unchanged.unchanged).toBe(true)
    }
    expect(commitMeasureEdit(ctx!, { valueText: '2 000', unit: 'kJ' })).toMatchObject({
      ok: true,
      stored: { value: '2000', unit: 'kJ' },
    })
  })

  it('commits when sub-cent values differ after display rounding (0.125 → 0.126)', () => {
    const doc = {
      a_018f0000_0000_7000_8000_000000000099: '0.125',
      a_018f0000_0000_7000_8000_000000000099__unit: 'kJ',
    }
    const kjColumn = 'energy#unit:kJ'
    const ctx = inlineMeasureEditContext(kjColumn, doc, energyEnergyDefs)
    expect(ctx).not.toBeNull()
    expect(measureEditInitialDraft(ctx!)).toEqual({ valueText: '0.125', unit: 'kJ' })
    const changed = commitMeasureEdit(ctx!, { valueText: '0.126', unit: 'kJ' })
    expect(changed).toMatchObject({
      ok: true,
      unchanged: false,
      stored: { value: '0.126', unit: 'kJ' },
    })
  })

  it('treats commitMeasureEdit(measureEditInitialDraft(ctx)) as unchanged in a kcal column over kJ storage', () => {
    const ctx = inlineMeasureEditContext(columnId, energyDoc, energyEnergyDefs)
    expect(ctx).not.toBeNull()
    const initial = measureEditInitialDraft(ctx!)
    const unchanged = commitMeasureEdit(ctx!, initial)
    expect(unchanged).toMatchObject({ ok: true, unchanged: true })
    for (let kj = 1; kj <= 5000; kj += 1) {
      const doc = {
        a_018f0000_0000_7000_8000_000000000099: String(kj),
        a_018f0000_0000_7000_8000_000000000099__unit: 'kJ',
      }
      const loopCtx = inlineMeasureEditContext(columnId, doc, energyEnergyDefs)
      expect(loopCtx).not.toBeNull()
      const loopInitial = measureEditInitialDraft(loopCtx!)
      expect(commitMeasureEdit(loopCtx!, loopInitial)).toMatchObject({ ok: true, unchanged: true })
    }
  })
})

const massMassDefs = {
  attributes: [
    {
      id: '018f0000-0000-7000-8000-000000000088',
      key: 'net_weight',
      kind: { type: 'number', unit_family: '018f0000-0000-7000-8000-000000000015' },
    },
  ],
  unit_families: [
    {
      id: '018f0000-0000-7000-8000-000000000015',
      key: 'mass',
      units: [
        { code: 'g', factor: '1' },
        { code: 'oz', factor: '28.349523125' },
      ],
    },
  ],
}

describe('measure inline edit across display units', () => {
  it('treats commitMeasureEdit(measureEditInitialDraft(ctx)) as unchanged when g is shown in oz', () => {
    const doc = {
      a_018f0000_0000_7000_8000_000000000088: '100',
      a_018f0000_0000_7000_8000_000000000088__unit: 'g',
    }
    const ozColumn = 'net_weight#unit:oz'
    const ctx = inlineMeasureEditContext(ozColumn, doc, massMassDefs)
    expect(ctx).not.toBeNull()
    const initial = measureEditInitialDraft(ctx!)
    expect(initial.unit).toBe('oz')
    expect(commitMeasureEdit(ctx!, initial)).toMatchObject({ ok: true, unchanged: true })
  })
})

describe('measureEditStoredUnchanged', () => {
  const ctx: MeasureEditContext = {
    stored: { value: 0.125, unit: 'kg' },
    displayUnit: 'kg',
    factors: { kg: 1, g: 0.001 },
    storageUnit: 'kg',
  }

  it('detects equal stored values at full precision', () => {
    expect(measureEditStoredUnchanged(ctx, { value: '0.125', unit: 'kg' })).toBe(true)
  })

  it('detects a real change when display rounding would hide it (0.125 vs 0.126)', () => {
    expect(measureEditStoredUnchanged(ctx, { value: '0.126', unit: 'kg' })).toBe(false)
  })

  it('treats parse/format storage round-trips as unchanged', () => {
    expect(measureEditStoredUnchanged(ctx, { value: '0.125000', unit: 'kg' })).toBe(true)
  })

  it('returns false when there is no prior stored value', () => {
    const empty: MeasureEditContext = { ...ctx, stored: null }
    expect(measureEditStoredUnchanged(empty, { value: '1', unit: 'kg' })).toBe(false)
  })
})

describe('resolveCellEditInitial', () => {
  it('uses fallback text for indexed columns without waiting on path-values', () => {
    expect(
      resolveCellEditInitial({
        needsPathValues: false,
        pathValuesPending: true,
        pathValuesHasData: false,
        pathValuesForCell: undefined,
        fallbackText: 'Mature cheddar',
      }),
    ).toEqual({ ok: true, text: 'Mature cheddar' })
  })

  it('blocks path-values columns while the batch is pending', () => {
    expect(
      resolveCellEditInitial({
        needsPathValues: true,
        pathValuesPending: true,
        pathValuesHasData: false,
        pathValuesForCell: undefined,
        fallbackText: '',
      }),
    ).toEqual({ ok: false, reason: 'unloaded' })
  })

  it('blocks when data arrived but this cell key is still missing', () => {
    expect(
      resolveCellEditInitial({
        needsPathValues: true,
        pathValuesPending: false,
        pathValuesHasData: true,
        pathValuesForCell: undefined,
        fallbackText: '',
      }),
    ).toEqual({ ok: false, reason: 'unloaded' })
  })

  it('seeds from loaded path-values (including a legitimately empty cell)', () => {
    expect(
      resolveCellEditInitial({
        needsPathValues: true,
        pathValuesPending: false,
        pathValuesHasData: true,
        pathValuesForCell: ["firm cow's-milk cheddar"],
        fallbackText: '',
      }),
    ).toEqual({ ok: true, text: "firm cow's-milk cheddar" })

    expect(
      resolveCellEditInitial({
        needsPathValues: true,
        pathValuesPending: false,
        pathValuesHasData: true,
        pathValuesForCell: [],
        fallbackText: 'painted leftover',
      }),
    ).toEqual({ ok: true, text: '' })
  })

  it('uses formatPathValues when provided (summary shape)', () => {
    expect(
      resolveCellEditInitial({
        needsPathValues: true,
        pathValuesPending: false,
        pathValuesHasData: true,
        pathValuesForCell: ['A', 'B', 'C'],
        fallbackText: '',
        formatPathValues: (values) => values.slice(0, 2).join(', ') + ' +1',
      }),
    ).toEqual({ ok: true, text: 'A, B +1' })
  })
})
