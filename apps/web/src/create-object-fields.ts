import type { Json } from './api'
import { attributeRows } from './model-view'

export type CreateObjectField = {
  key: string
  label: string
  kind: string
  form: string
  languageDependent: boolean
  options?: Array<{ value: string; label: string }>
  showByDefault: boolean
  testId: string
  /** Base unit for number/range fields, so the server gets a valid value. */
  unit: string
  multiline: boolean
}

export type CreateObjectFieldGroups = {
  primary: CreateObjectField[]
  more: CreateObjectField[]
}

const SERVER_OWNED = new Set(['created_at', 'updated_at', 'updated_by'])
const FIRST = ['number', 'name'] as const
const FIRST_KEYS = new Set<string>(FIRST)
const SUPPORTED = new Set(['text', 'number', 'range', 'value_list', 'boolean', 'date'])

/**
 * Split a type's attributes into the fields the create popup shows first and
 * the ones behind "Show more fields". Server-owned standards stay out.
 * Number and name are always present, first, and keep their stable test ids.
 */
export function createObjectFields(defs: Json | undefined, typeKey: string, language = 'en'): CreateObjectFieldGroups {
  const rows = attributeRows(defs, typeKey ? { kind: 'type', typeKey } : null, language)
  const attributes = (defs?.attributes as Json[] | undefined) ?? []
  const fields = new Map<string, CreateObjectField>()

  for (const row of rows) {
    if (!row.key || SERVER_OWNED.has(row.key) || fields.has(row.key)) continue
    if (!SUPPORTED.has(row.kind) && !FIRST_KEYS.has(row.key)) continue
    const raw = attributes.find((item) => String(item.id ?? '') === row.id || String(item.key ?? '') === row.key)
    if (raw?.multiple === true) continue
    fields.set(row.key, {
      key: row.key,
      label: row.label || row.key,
      kind: row.kind,
      form: String(((raw?.kind as Json | undefined) ?? {}).form ?? ''),
      languageDependent: row.languages,
      options: row.kind === 'value_list' ? optionsFor(defs, raw, language) : undefined,
      showByDefault: row.showByDefault,
      testId: testIdFor(row.key),
      unit: row.kind === 'number' || row.kind === 'range' ? baseUnit(defs, String(((raw?.kind as Json | undefined) ?? {}).unit_family ?? '')) : '',
      multiline: row.kind === 'text' && String(((raw?.kind as Json | undefined) ?? {}).form ?? '') === 'long',
    })
  }

  for (const key of FIRST) {
    if (!fields.has(key)) fields.set(key, fallbackField(key))
  }

  const ordered = FIRST.flatMap((key) => {
    const field = fields.get(key)
    return field ? [field] : []
  }).concat([...fields.values()].filter((field) => !FIRST_KEYS.has(field.key)))

  const primary: CreateObjectField[] = []
  const more: CreateObjectField[] = []
  for (const field of ordered) {
    if (field.showByDefault) primary.push(field)
    else more.push(field)
  }
  return { primary, more }
}

/** Wire values for the extra create fields. Empty values are omitted, like the links dialog. */
export function createObjectFieldValues(fields: CreateObjectField[], draft: Record<string, string>): Json {
  const values: Json = {}
  for (const field of fields) {
    if (FIRST_KEYS.has(field.key)) continue
    const text = (draft[field.key] ?? '').trim()
    if (!text) continue
    if (field.languageDependent) {
      values[field.key] = { en: text }
      continue
    }
    if (field.kind === 'number') {
      values[field.key] = field.unit ? { value: text, unit: field.unit } : { value: text }
      continue
    }
    if (field.kind === 'range') {
      values[field.key] = { min: text, max: text, ...(field.unit ? { unit: field.unit } : {}) }
      continue
    }
    if (field.kind === 'boolean') {
      if (text === 'true' || text === 'false') values[field.key] = text === 'true'
      continue
    }
    values[field.key] = text
  }
  return values
}

function fallbackField(key: 'number' | 'name'): CreateObjectField {
  return {
    key,
    label: key === 'number' ? 'Number' : 'Name',
    kind: key === 'number' ? 'number' : 'text',
    form: '',
    languageDependent: key === 'name',
    showByDefault: true,
    testId: testIdFor(key),
    unit: '',
    multiline: false,
  }
}

function testIdFor(key: string) {
  return key === 'number' || key === 'name' ? `new-${key}` : `new-field-${key}`
}

function optionsFor(defs: Json | undefined, attribute: Json | undefined, language: string) {
  const kind = (attribute?.kind as Json | undefined) ?? {}
  const inline = (kind.options as Json[] | undefined) ?? []
  const listKey = String(kind.list ?? '')
  const list = ((defs?.value_lists as Json[] | undefined) ?? []).find((item) => String(item.key ?? '') === listKey)
  const rows = inline.length > 0 ? inline : ((list?.options as Json[] | undefined) ?? [])
  const options = rows.map((option) => ({
    value: String(option.code ?? ''),
    label: labelOf(option.labels, language, String(option.code ?? '')),
  })).filter((option) => option.value)
  return options.length > 0 ? options : undefined
}

function baseUnit(defs: Json | undefined, id: string) {
  if (!id) return ''
  const family = ((defs?.unit_families as Json[] | undefined) ?? []).find((item) => String(item.id ?? '') === id || String(item.key ?? '') === id)
  if (!family) return ''
  const base = String(family.base_unit ?? '')
  if (base) return base
  const first = ((family.units as Json[] | undefined) ?? [])[0]
  return String(first?.code ?? '')
}

function labelOf(value: unknown, language: string, fallback: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const labels = value as Record<string, unknown>
  const preferred = labels[language] ?? labels.en ?? labels.sv
  if (typeof preferred === 'string' && preferred) return preferred
  const first = Object.values(labels).find((item) => typeof item === 'string' && item)
  return typeof first === 'string' ? first : fallback
}
