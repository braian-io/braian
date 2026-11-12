/**
 * Build a FieldDef tree for the Fields › palette from /v1/definitions
 * and /v1/types/{id}/attribute-paths.
 *
 * Own attributes become leaves (with qualifier steps from kind).
 * Link labels become link-shaped fields that drill into the peer type.
 * Parts such as `.unit` / `.label` are not listed as separate fields —
 * they are chosen as qualifiers after the leaf is selected.
 */
import type { Json } from '../api'
import type { FieldDef, FieldValueShape } from './qualifiers'
export type { FieldDef }

export type DefsJson = Json

function labelOf(labels: unknown, lang = 'en'): string {
  if (!labels || typeof labels !== 'object') return ''
  const map = labels as Record<string, unknown>
  const hit = map[lang] ?? map.en ?? Object.values(map)[0]
  return hit == null ? '' : String(hit)
}

function typeByKey(defs: DefsJson, key: string): Json | undefined {
  const types = (defs.types as Json[] | undefined) ?? []
  return types.find((item) => String(item.key) === key || String(item.id) === key)
}

function attrById(defs: DefsJson, id: string): Json | undefined {
  const attrs = (defs.attributes as Json[] | undefined) ?? []
  return attrs.find((item) => String(item.id) === id || String(item.key) === id)
}

function attrByKey(defs: DefsJson, key: string): Json | undefined {
  const attrs = (defs.attributes as Json[] | undefined) ?? []
  return attrs.find((item) => String(item.key) === key)
}

function kindType(kind: unknown): string {
  if (!kind || typeof kind !== 'object') return 'text'
  return String((kind as Json).type ?? 'text')
}

function unitsForFamily(defs: DefsJson, familyToken: string | undefined): string[] {
  if (!familyToken) return []
  const families = (defs.unit_families as Json[] | undefined) ?? []
  const family = families.find(
    (item) => String(item.key) === familyToken || String(item.id) === familyToken,
  )
  if (!family) return []
  return ((family.units as Json[] | undefined) ?? []).map((unit) => String(unit.code))
}

function factorsForFamily(defs: DefsJson, familyToken: string | undefined): Record<string, number> {
  if (!familyToken) return {}
  const families = (defs.unit_families as Json[] | undefined) ?? []
  const family = families.find(
    (item) => String(item.key) === familyToken || String(item.id) === familyToken,
  )
  if (!family) return {}
  const out: Record<string, number> = {}
  for (const unit of (family.units as Json[] | undefined) ?? []) {
    const code = String(unit.code).toLowerCase()
    const factor = Number(unit.factor)
    if (code && Number.isFinite(factor)) out[code] = factor
  }
  return out
}

export function unitFactors(defs: DefsJson): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const family of (defs.unit_families as Json[] | undefined) ?? []) {
    const key = String(family.key)
    out[key] = factorsForFamily(defs, key)
    out[String(family.id)] = out[key]
  }
  return out
}

function shapeOf(attr: Json, defs: DefsJson): { shape: FieldValueShape; extra: Partial<FieldDef> } {
  const kind = attr.kind as Json | undefined
  const type = kindType(kind)
  const languages = ((defs.languages as string[] | undefined) ?? ['en']).map(String)
  if (attr.language_dependent) {
    return { shape: 'language', extra: { languages } }
  }
  if (type === 'number' && kind?.unit_family) {
    const family = String(kind.unit_family)
    // unit_family may be id — resolve to codes
    const families = (defs.unit_families as Json[] | undefined) ?? []
    const hit = families.find((item) => String(item.id) === family || String(item.key) === family)
    const units = unitsForFamily(defs, hit ? String(hit.key) : family)
    return { shape: 'unit', extra: { units, typeLabel: 'number' } }
  }
  if (type === 'value_list') {
    return { shape: 'value_list', extra: { valueListModes: ['label', 'code'] } }
  }
  if (type === 'range') {
    const family = kind?.unit_family != null ? String(kind.unit_family) : undefined
    const families = (defs.unit_families as Json[] | undefined) ?? []
    const hit = family
      ? families.find((item) => String(item.id) === family || String(item.key) === family)
      : undefined
    const rangeUnit = hit ? String(hit.base_unit ?? '') : ''
    return {
      shape: 'range',
      extra: { rangeParts: ['min', 'max'], rangeUnit: rangeUnit || undefined },
    }
  }
  if (type === 'boolean') return { shape: 'boolean', extra: {} }
  if (type === 'number') return { shape: 'number', extra: {} }
  return { shape: 'text', extra: {} }
}

function attributeField(defs: DefsJson, attr: Json, source?: string): FieldDef {
  const { shape, extra } = shapeOf(attr, defs)
  const field: FieldDef = {
    id: String(attr.key),
    name: labelOf(attr.labels) || String(attr.key),
    typeLabel: kindType(attr.kind),
    shape,
    ...extra,
  }
  if (source) field.source = source
  return field
}

type SourcedAttribute = { attr: Json; source?: string }

function groupLabel(group: Json): string {
  return labelOf(group.labels) || String(group.key ?? group.id ?? '')
}

/**
 * Same walk as `attributes_for_type` in crates/model/src/path.rs:
 * own attributes, then every group in each allowed structure, then legacy
 * classes bound to those groups. Missing `structures` means all; an empty
 * list means none. Values are never inherited, only the column choice.
 */
function attributesForType(defs: DefsJson, typeObj: Json): SourcedAttribute[] {
  const out: SourcedAttribute[] = []
  const seen = new Set<string>()
  function add(rawId: unknown, source?: string) {
    const attr = attrById(defs, String(rawId))
    if (!attr) return
    const key = String(attr.id ?? attr.key)
    if (seen.has(key)) return
    seen.add(key)
    out.push(source ? { attr, source } : { attr })
  }

  for (const id of (typeObj.attributes as unknown[] | undefined) ?? []) {
    add(id)
  }

  const structures = (defs.structures as Json[] | undefined) ?? []
  const allowed = typeObj.structures as unknown[] | undefined
  const allowedIds = allowed ? new Set(allowed.map(String)) : null
  for (const structure of structures) {
    if (allowedIds && !allowedIds.has(String(structure.id))) continue
    const groups = (structure.groups as Json[] | undefined) ?? []
    for (const group of groups) {
      const source = groupLabel(group)
      for (const id of (group.attributes as unknown[] | undefined) ?? []) add(id, source)
      // Older revisions may still nest class lists under the group.
      for (const cls of (group.classes as Json[] | undefined) ?? []) {
        for (const id of (cls.attributes as unknown[] | undefined) ?? []) add(id, source)
      }
    }
    for (const cls of (structure.classes as Json[] | undefined) ?? []) {
      const group = groups.find(
        (item) => String(item.id) === String(cls.group) || String(item.key) === String(cls.group),
      )
      if (!group) continue
      const source = groupLabel(group)
      for (const id of (cls.attributes as unknown[] | undefined) ?? []) add(id, source)
    }
  }
  return out
}

/**
 * Field catalog for one object type key.
 * Link fields use the path label key (e.g. `articles`) as id — same as path text before `>`.
 */
export function fieldCatalogForType(defs: DefsJson, typeKey: string): FieldDef[] {
  const typeObj = typeByKey(defs, typeKey)
  if (!typeObj) return []
  const fields: FieldDef[] = []
  const seen = new Set<string>()

  for (const { attr, source } of attributesForType(defs, typeObj)) {
    const key = String(attr.key)
    if (seen.has(key)) continue
    seen.add(key)
    fields.push(attributeField(defs, attr, source))
  }

  const types = (defs.types as Json[] | undefined) ?? []
  for (const linkType of types) {
    const spec = linkType.link as Json | undefined
    if (!spec) continue
    const fromTypes = ((spec.from_types as unknown[]) ?? []).map(String)
    const toTypes = ((spec.to_types as unknown[]) ?? []).map(String)
    const typeId = String(typeObj.id)

    // Source side: show to_label (e.g. Articles), walk to peer types
    if (fromTypes.includes(typeId) || fromTypes.includes(typeKey)) {
      const labelKey = String((spec.to_label as Json)?.key ?? linkType.key)
      const labelName = labelOf((spec.to_label as Json)?.labels) || labelKey
      const many = String(spec.to_cardinality) === 'many' || String(spec.from_cardinality) === 'many'
      // from_cardinality caps links on the from object; many => product has many articles
      const fromMany = String(spec.from_cardinality) === 'many'
      const peerFields: FieldDef[] = []
      const peerSeen = new Set<string>()
      for (const peerId of toTypes) {
        const peer = typeByKey(defs, peerId)
        if (!peer) continue
        for (const { attr, source } of attributesForType(defs, peer)) {
          const key = String(attr.key)
          if (peerSeen.has(key)) continue
          peerSeen.add(key)
          peerFields.push(attributeField(defs, attr, source))
        }
      }
      if (!seen.has(labelKey)) {
        seen.add(labelKey)
        fields.push({
          id: labelKey,
          name: labelName,
          typeLabel: 'link',
          shape: 'link',
          link: { many: fromMany, peerFields, peerLabel: labelName },
        })
      }
    }

    // Target side: show from_label (e.g. Product / Supplier)
    if (toTypes.includes(typeId) || toTypes.includes(typeKey)) {
      const labelKey = String((spec.from_label as Json)?.key ?? linkType.key)
      const labelName = labelOf((spec.from_label as Json)?.labels) || labelKey
      const toMany = String(spec.to_cardinality) === 'many'
      const peerFields: FieldDef[] = []
      const peerSeen = new Set<string>()
      for (const peerId of fromTypes) {
        const peer = typeByKey(defs, peerId)
        if (!peer) continue
        for (const { attr, source } of attributesForType(defs, peer)) {
          const key = String(attr.key)
          if (peerSeen.has(key)) continue
          peerSeen.add(key)
          peerFields.push(attributeField(defs, attr, source))
        }
      }
      if (!seen.has(labelKey)) {
        seen.add(labelKey)
        fields.push({
          id: labelKey,
          name: labelName,
          typeLabel: 'link',
          shape: 'link',
          link: { many: toMany, peerFields, peerLabel: labelName },
        })
      }
    }
  }

  return fields
}

/** Resolve attribute key for a leaf FieldDef id (same as id for non-links). */
export function leafAttributeKey(fieldId: string): string {
  return fieldId
}

export { attrByKey, typeByKey, factorsForFamily, labelOf }

/** Merge pathless system view columns (type, version) into the Fields › list as ordinary fields. */
export function withSystemViewFields(
  fields: FieldDef[],
  systemColumns: Array<{ key: string; label: string; default_index?: number }> = [],
): FieldDef[] {
  if (systemColumns.length === 0) return fields
  const out = [...fields]
  const seen = new Set(out.map((field) => field.id))
  for (const system of systemColumns) {
    if (seen.has(system.key)) continue
    const field: FieldDef = {
      id: system.key,
      name: system.label,
      typeLabel: 'text',
      shape: 'text',
    }
    const at = Math.min(system.default_index ?? out.length, out.length)
    out.splice(at, 0, field)
    seen.add(system.key)
  }
  return out
}
