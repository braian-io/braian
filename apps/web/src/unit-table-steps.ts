import { normalizeDecimalInput, parseDecimalInput } from './format'
import { copy } from './i18n'

export type UnitDraftRow = {
  id: string
  familyKey: string
  code: string
  factor: string
  offset: string
  symbol: string
  label: string
  isBase: boolean
}

export type UnitStep = { name: string; args: Record<string, unknown> }

/** Stored decimal text. Empty factor becomes `1` and an empty offset becomes `0`. */
export function normalizeUnitNumber(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return normalizeDecimalInput(trimmed) ?? trimmed
}

export function unitNumberError(value: string, kind: 'factor' | 'offset'): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return kind === 'factor' ? copy.linkFieldNumber : undefined
  const normalized = normalizeDecimalInput(trimmed)
  if (normalized == null) return copy.linkFieldNumber
  if (kind === 'factor' && (parseDecimalInput(normalized) ?? 0) <= 0) return copy.linkFieldNumber
  return undefined
}

function isOne(value: string) {
  return parseDecimalInput(value.trim()) === 1
}

function isZero(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return true
  return parseDecimalInput(trimmed) === 0
}

/** The named base is the only unit with factor 1 and offset 0. */
export function assertUnitFamilies(rows: UnitDraftRow[]) {
  const families = new Map<string, UnitDraftRow[]>()
  for (const row of rows) {
    if (!row.familyKey || !row.code) continue
    const list = families.get(row.familyKey) ?? []
    list.push(row)
    families.set(row.familyKey, list)
  }
  for (const list of families.values()) {
    const bases = list.filter((row) => row.isBase)
    const affine = list.filter((row) => isOne(row.factor) && isZero(row.offset))
    if (bases.length !== 1 || affine.length !== 1 || affine[0]?.id !== bases[0]?.id) {
      throw new Error(copy.unitBase)
    }
  }
}

function payload(row: UnitDraftRow, factor: string, offset: string) {
  return {
    code: row.code,
    factor,
    offset,
    symbol: row.symbol,
    label: row.label,
  }
}

/** Steps for inline edits. New families are created from the dialog, not here. */
export function unitSaveSteps(stored: UnitDraftRow[], drafts: Record<string, UnitDraftRow>): UnitStep[] {
  const merged = new Map(stored.map((row) => [row.id, drafts[row.id] ?? row]))
  for (const row of Object.values(drafts)) merged.set(row.id, row)
  assertUnitFamilies([...merged.values()])
  const steps: UnitStep[] = []
  for (const row of Object.values(drafts)) {
    const factor = normalizeUnitNumber(row.factor, '1')
    const offset = normalizeUnitNumber(row.offset, '0')
    const existing = stored.find((item) => item.id === row.id)
    if (!existing) {
      const known = stored.some((item) => item.familyKey === row.familyKey && item.code)
      if (!known && row.familyKey) {
        steps.push({
          name: 'model.create_unit_family',
          args: {
            key: row.familyKey,
            dimension: row.familyKey,
            base_unit: row.code || row.familyKey,
            units: row.code ? [payload(row, factor, offset)] : [],
          },
        })
      } else if (row.code) {
        steps.push({
          name: 'model.add_unit',
          args: { unit_family: row.familyKey, ...payload(row, factor, offset) },
        })
      }
      continue
    }
    if (!row.code) continue
    const unit = row.id.split(':').pop()
    const originalBase = stored.find((item) => item.familyKey === row.familyKey && item.isBase)?.code
    steps.push({
      name: 'model.update_unit',
      args: {
        unit_family: row.familyKey,
        unit,
        factor,
        offset,
        symbol: row.symbol,
        label: row.label,
        ...(row.isBase && originalBase !== row.code ? { base_unit: row.code } : {}),
        ...(row.code !== unit ? { new_code: row.code } : {}),
      },
    })
  }
  return steps
}
