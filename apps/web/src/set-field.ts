import { api, freeObject, textValue, type Json } from './api'
import { registerCommandRunner, type CommandTarget } from './command-registry'
import { copy } from './i18n'
import { effectiveFields } from './model-view'
import { validateDetailField } from './detail-field-validate'
import { writeErrorMessage } from './write-error'

const SKIP_KEYS = new Set(['number', 'key', 'type', 'version', 'created_at', 'updated_at', 'updated_by'])
const KINDS = new Set(['text', 'number', 'range', 'value_list', 'boolean', 'date'])

export type SetFieldChoice = {
  key: string
  label: string
  kind: string
  form: string
  languageDependent: boolean
  multiple: boolean
  required: boolean
  maxLength?: number
  integer?: boolean
  options: Array<{ value: string; label: string }>
  units: string[]
  defaultUnit: string
}

export type SetFieldDraft = {
  text: string
  min: string
  max: string
  unit: string
  checked: boolean
  codes: string[]
}

export type SetFieldTarget = { id: string; version: number }

export type SetFieldFailure = { id: string; message: string }

export type SetFieldWriteResult = { applied: string[]; failed: SetFieldFailure[] }

type AttributeKind = {
  type?: unknown
  form?: unknown
  list?: unknown
  max_length?: unknown
  integer?: unknown
  unit_family?: unknown
  default_unit?: unknown
  options?: unknown
}

/** Attribute fields the selected type (and, when given, one group) can store. */
export function setFieldChoices(
  defs: Json | undefined,
  typeKey: string,
  language = 'en',
  groups: Array<{ structure: string; group: string }> = [],
): SetFieldChoice[] {
  if (!defs || !typeKey) return []
  const types = (defs.types as Json[] | undefined) ?? []
  const objectType = types.find((item) => String(item.key ?? '') === typeKey)
  const keyAttribute = String(objectType?.key_attribute ?? '')
  const attributes = (defs.attributes as Json[] | undefined) ?? []
  const choices: SetFieldChoice[] = []
  for (const field of effectiveFields(defs, typeKey, groups, language)) {
    if (!field.key || SKIP_KEYS.has(field.key) || !KINDS.has(field.kind)) continue
    if (keyAttribute && (field.id === keyAttribute || field.key === keyAttribute)) continue
    const raw = attributes.find((item) => String(item.id ?? '') === field.id || String(item.key ?? '') === field.key)
    const multiple = raw?.multiple === true
    if (multiple && field.kind !== 'value_list') continue
    const kind = (raw?.kind as AttributeKind | undefined) ?? {}
    const units = unitsFor(defs, String(kind.unit_family ?? ''))
    const defaultUnit = String(kind.default_unit ?? '') || units[0] || ''
    choices.push({
      key: field.key,
      label: field.label || field.key,
      kind: field.kind,
      form: String(kind.form ?? ''),
      languageDependent: Boolean(raw?.language_dependent),
      multiple,
      required: Boolean(raw?.required),
      maxLength: typeof kind.max_length === 'number' ? kind.max_length : undefined,
      integer: kind.integer === true,
      options: field.kind === 'value_list' ? optionsFor(defs, kind, language) : [],
      units,
      defaultUnit,
    })
  }
  return choices
}

export function emptySetFieldDraft(choice?: SetFieldChoice): SetFieldDraft {
  return {
    text: '',
    min: '',
    max: '',
    unit: choice?.defaultUnit || choice?.units[0] || '',
    checked: false,
    codes: [],
  }
}

/** `food:bread` → one group membership. Anything else is type attributes only. */
export function setFieldGroups(activeGroup: string | null | undefined): Array<{ structure: string; group: string }> {
  if (!activeGroup) return []
  const split = activeGroup.indexOf(':')
  if (split <= 0 || split >= activeGroup.length - 1) return []
  return [{ structure: activeGroup.slice(0, split), group: activeGroup.slice(split + 1) }]
}

export function setFieldNoun(plural: string): string {
  const text = plural.trim()
  return text ? text.toLocaleLowerCase() : copy.setFieldObjects
}

export function setFieldConfirmMessage(field: string, count: number, noun: string): string {
  return copy.setFieldConfirm
    .replaceAll('{field}', field)
    .replaceAll('{count}', String(count))
    .replaceAll('{noun}', noun)
}

/** More than one row asks for a plain count confirm. One row writes directly. */
export function setFieldNeedsConfirm(count: number): boolean {
  return count > 1
}

export function setFieldNextValue(choice: SetFieldChoice, draft: SetFieldDraft, language: string): unknown {
  if (choice.kind === 'boolean') return draft.checked === true
  if (choice.kind === 'value_list' && choice.multiple) return [...draft.codes]
  if (choice.kind === 'number') {
    const text = draft.text.trim().replace(',', '.')
    const unit = draft.unit || choice.defaultUnit || choice.units[0] || ''
    return unit ? { value: text, unit } : { value: text }
  }
  if (choice.kind === 'range') {
    const unit = draft.unit || choice.defaultUnit || choice.units[0] || ''
    return {
      min: draft.min.trim().replace(',', '.'),
      max: draft.max.trim().replace(',', '.'),
      ...(unit ? { unit } : {}),
    }
  }
  if (choice.languageDependent) return { [language || 'en']: draft.text }
  return draft.text
}

export function setFieldValues(key: string, next: unknown): Json {
  return { [key]: next as Json[string] }
}

/** Client check shared with Detail autosave. An invalid value is not written. */
export function setFieldValueError(choice: SetFieldChoice, next: unknown): string {
  if (choice.kind === 'number') {
    const raw = next && typeof next === 'object' && !Array.isArray(next) ? (next as Json).value : next
    if (raw == null || String(raw).trim() === '') return copy.fieldInvalidNumber
  }
  if (choice.kind === 'value_list' && !choice.multiple) {
    if (typeof next !== 'string' || next.trim() === '') return copy.fieldChoice
  }
  if (choice.kind === 'date') {
    if (typeof next !== 'string' || next.trim() === '') return copy.fieldDate
  }
  if (choice.kind === 'range') {
    const record = next && typeof next === 'object' && !Array.isArray(next) ? (next as Json) : {}
    if (String(record.min ?? '').trim() === '' && String(record.max ?? '').trim() === '') return copy.fieldInvalidNumber
  }
  return validateDetailField({
    required: choice.required,
    kind: { type: choice.kind, max_length: choice.maxLength, integer: choice.integer },
    multiple: choice.multiple,
    languageDependent: choice.languageDependent,
    options: choice.options.map((option) => option.value),
    previous: null,
    next,
  })
}

export function setFieldFailureMessage(failed: SetFieldFailure[], applied: number): string {
  const summary = copy.setFieldPartial
    .replaceAll('{applied}', String(applied))
    .replaceAll('{failed}', String(failed.length))
  const details = [...new Set(failed.map((item) => item.message.trim()).filter(Boolean))]
  return details.length > 0 ? `${summary} ${details.join('; ')}` : summary
}

export function versionsFromRows(rows: Array<{ id: string; version: string }>): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    if (!row.id || row.version === '') continue
    const version = Number(row.version)
    if (Number.isFinite(version)) map.set(row.id, version)
  }
  return map
}

export async function loadSetFieldTargets(
  ids: string[],
  knownVersions: ReadonlyMap<string, number>,
  loadVersion: (id: string) => Promise<number>,
): Promise<{ targets: SetFieldTarget[]; failed: SetFieldFailure[] }> {
  const targets: SetFieldTarget[] = []
  const failed: SetFieldFailure[] = []
  for (const id of ids) {
    const known = knownVersions.get(id)
    if (known != null) {
      targets.push({ id, version: known })
      continue
    }
    try {
      const version = await loadVersion(id)
      targets.push({ id, version })
    } catch (reason) {
      failed.push({ id, message: writeErrorMessage(reason) ?? copy.saveFailed })
    }
  }
  return { targets, failed }
}

/**
 * Patch each object. A failure leaves the rows already written in place.
 * The patch is always `PATCH /v1/objects/{id}` — never mass_edit and never /v1/bulk.
 */
export async function writeSetField(input: {
  targets: SetFieldTarget[]
  values: Json
  patch: (target: SetFieldTarget, values: Json) => Promise<unknown>
}): Promise<SetFieldWriteResult> {
  const applied: string[] = []
  const failed: SetFieldFailure[] = []
  for (const target of input.targets) {
    try {
      await input.patch(target, input.values)
      applied.push(target.id)
    } catch (reason) {
      failed.push({ id: target.id, message: writeErrorMessage(reason) ?? copy.saveFailed })
    }
  }
  return { applied, failed }
}

export async function commitSetField(input: {
  targets: SetFieldTarget[]
  values: Json
  onSaved?: (saved: Json, id: string) => Promise<void>
}): Promise<SetFieldWriteResult> {
  return writeSetField({
    targets: input.targets,
    values: input.values,
    patch: async (target, values) => {
      const saved = await api.patch('/v1/objects/{id}', {
        params: { path: { id: target.id }, header: { 'If-Match': target.version } },
        body: { values: freeObject(values) },
      }) as Json
      await input.onSaved?.({ ...saved, id: String(saved.id ?? target.id) }, target.id)
    },
  })
}

export const REQUEST_SET_FIELD = 'braian:request-set-field'

export type SetFieldRequest = { viewId: string; ids: string[] }

/** The table that owns `viewId` opens Set field. Several object tables share one command. */
export function requestSetField(viewId: string, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  const target = globalThis.window
  if (!viewId || !target) return
  target.dispatchEvent(new CustomEvent<SetFieldRequest>(REQUEST_SET_FIELD, {
    detail: { viewId, ids: unique },
  }))
}

function idsFromCommandTarget(target: CommandTarget): string[] {
  const rows = Array.isArray(target.objects) ? target.objects : []
  const ids = rows
    .map((row) => (row && typeof row === 'object' ? String((row as { id?: unknown }).id ?? '') : ''))
    .filter(Boolean)
  if (ids.length === 0 && target.objectId) ids.push(String(target.objectId))
  return ids
}

/** Palette mass-edit has no row target; the focused pane's active tab is the table. */
export function focusedTableViewId(): string {
  const tab = globalThis.document?.querySelector('.pane.focused .pane-tab.active')
  return tab?.getAttribute('data-tab') ?? ''
}

let setFieldCommandRegistered = false

export function ensureSetFieldCommandRunner(): void {
  if (setFieldCommandRegistered || !globalThis.window) return
  setFieldCommandRegistered = true
  const open = (target: CommandTarget) => {
    const viewId = String(target.viewId ?? '') || focusedTableViewId()
    requestSetField(viewId, idsFromCommandTarget(target))
  }
  registerCommandRunner('table:set-field', open)
  registerCommandRunner('table:mass-edit', open)
}

function unitsFor(defs: Json, familyId: string): string[] {
  if (!familyId) return []
  const families = (defs.unit_families as Json[] | undefined) ?? []
  const family = families.find((item) => String(item.id ?? '') === familyId || String(item.key ?? '') === familyId)
  return ((family?.units as Json[] | undefined) ?? []).map((unit) => String(unit.code ?? '')).filter(Boolean)
}

function optionsFor(defs: Json, kind: AttributeKind, language: string) {
  const inline = (kind.options as Json[] | undefined) ?? []
  const listKey = String(kind.list ?? '')
  const list = ((defs.value_lists as Json[] | undefined) ?? []).find((item) => String(item.key ?? '') === listKey)
  const rows = inline.length > 0 ? inline : ((list?.options as Json[] | undefined) ?? [])
  return rows
    .map((option) => ({
      value: String(option.code ?? ''),
      label: textValue(option.labels, language) || String(option.code ?? ''),
    }))
    .filter((option) => option.value)
}
