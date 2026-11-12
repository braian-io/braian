import { attributeByKey, attributeIndexField } from './index-fields'
import type { Json } from './api'
import { textValue } from './api'
import { isHopPath } from './column-prefs'

/** How many linked values to show before "+N". */
export const PATH_SUMMARY_VISIBLE = 2

export type PathValuesMap = Record<string, Record<string, string[]>>

export type PathValuesResponse = { values?: PathValuesMap }

/** Summarize many linked values: `A, B +2` with the full list for a tooltip. */
export function summarizePathValues(values: string[] | undefined | null): {
  text: string
  title: string
} {
  const list = (values ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)
  if (list.length === 0) return { text: '', title: '' }
  if (list.length <= PATH_SUMMARY_VISIBLE) {
    const text = list.join(', ')
    return { text, title: text }
  }
  const shown = list.slice(0, PATH_SUMMARY_VISIBLE).join(', ')
  const rest = list.length - PATH_SUMMARY_VISIBLE
  return { text: `${shown} +${rest}`, title: list.join(', ') }
}

/**
 * Read a non-hop path from a Typesense hit, including parts (`weight.unit` →
 * `a_<id>__unit`). Hop paths need the path-values batch.
 */
export function readPathFromDoc(doc: Json | undefined, defs: Json | undefined, path: string): string {
  if (!doc || !path || isHopPath(path)) return ''
  const [head, ...rest] = path.split('.')
  const languageMatch = head?.includes('@') ? head.split('@') : null
  const key = languageMatch ? languageMatch[0]! : head!
  const language = languageMatch?.[1]
  const attribute = attributeByKey(defs, key)
  const id = String(attribute?.id ?? '')
  const part = rest[0] ?? ''
  const kind = attribute?.kind && typeof attribute.kind === 'object' ? (attribute.kind as Json) : undefined
  const measured = String(kind?.type ?? '') === 'number' && Boolean(kind?.unit_family)
  const base = id ? attributeIndexField(id, language) : ''
  const legacyBase = language ? `a_${key}__${language.replaceAll('-', '_')}` : `a_${key}`
  const readFields = (fields: string[]) => {
    for (const field of fields) {
      const text = textValue(doc[field])
      if (text) return text
    }
    return ''
  }
  if (part === 'unit' || part === 'min' || part === 'max') {
    const fields: string[] = []
    if (base) fields.push(`${base}__${part}`)
    fields.push(`${legacyBase}__${part}`, `a_${key}__${part}`)
    return readFields(fields)
  }
  const valueFields: string[] = []
  if (id) {
    if (part === 'value') valueFields.push(base, attributeIndexField(id))
    else valueFields.push(base, attributeIndexField(id), attributeIndexField(id, 'en'), attributeIndexField(id, 'sv'))
  }
  if (part === 'value') valueFields.push(legacyBase, `a_${key}`)
  else valueFields.push(legacyBase, `a_${key}`, `a_${key}__en`, `a_${key}__sv`)
  const value = readFields(valueFields)
  if (!value) return ''
  if (measured && part === '') {
    const unitFields: string[] = []
    if (id) unitFields.push(`${attributeIndexField(id)}__unit`)
    unitFields.push(`${legacyBase}__unit`, `a_${key}__unit`)
    const unit = readFields(unitFields)
    return unit ? `${value} ${unit}` : value
  }
  return value
}
