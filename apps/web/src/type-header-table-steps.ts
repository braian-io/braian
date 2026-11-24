import type { StoredFieldChange, StoredTypeHeaderPatch } from './model-table-draft-persist'

function sameStructures(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const a = [...left].sort()
  const b = [...right].sort()
  return a.every((item, index) => item === b[index])
}

export function buildTypeHeaderSteps(
  typeKey: string,
  patch: StoredTypeHeaderPatch | undefined,
  language: string,
): Array<{ op: string } & Record<string, unknown>> {
  if (!patch) return []
  const steps: Array<{ op: string } & Record<string, unknown>> = []
  const effectiveKey = patch.typeKey?.value != null ? String(patch.typeKey.value).trim() : typeKey
  if (patch.typeKey && patch.typeKey.value !== patch.typeKey.base && effectiveKey) {
    steps.push({ op: 'rename_type_key', key: patch.typeKey.base, new_key: effectiveKey })
  }
  const update: Record<string, unknown> = {}
  if (patch.singular && patch.singular.value !== patch.singular.base) {
    update.singular = String(patch.singular.value)
  }
  if (patch.plural && patch.plural.value !== patch.plural.base) {
    update.plural = String(patch.plural.value)
  }
  if (Object.keys(update).length > 0) {
    steps.push({ op: 'update_type', key: effectiveKey || typeKey, language, ...update })
  }
  if (patch.structures && !sameStructures(patch.structures.base, patch.structures.value)) {
    steps.push({ op: 'set_structures', type_key: effectiveKey || typeKey, structures: patch.structures.value })
  }
  return steps
}

export function typeHeaderPatchDirty(patch: StoredTypeHeaderPatch | undefined): boolean {
  if (!patch) return false
  if (patch.singular && patch.singular.value !== patch.singular.base) return true
  if (patch.plural && patch.plural.value !== patch.plural.base) return true
  if (patch.typeKey && patch.typeKey.value !== patch.typeKey.base) return true
  if (patch.structures && !sameStructures(patch.structures.base, patch.structures.value)) return true
  return false
}

export function recordTypeHeaderField<T extends string | string[]>(
  base: T,
  value: T,
  prior?: StoredFieldChange | { base: string[]; value: string[] },
): StoredFieldChange | { base: string[]; value: string[] } | undefined {
  if (Array.isArray(base) && Array.isArray(value)) {
    if (sameStructures(base, value)) return undefined
    const kept = prior && 'base' in prior ? prior : undefined
    return { base: kept?.base ?? base, value }
  }
  if (base === value) return undefined
  const change = prior as StoredFieldChange | undefined
  return { base: change?.base ?? base, value: value as string | boolean }
}