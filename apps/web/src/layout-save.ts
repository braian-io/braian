import type { LayoutDoc } from './layout'

/** `clientSavedAt` is a client clock, not a user edit, so it is not part of the merge. */

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function sameJson(left: unknown, right: unknown) {
  return stable(left) === stable(right)
}

/**
 * Three-way merge of a personal layout.
 * Fields the user changed since `base` win. Fields they left alone keep the server copy,
 * so a focus toggle does not wipe a layout another save already stored.
 * A null base means the user started from an empty document, so their copy is the change.
 */
export function rebaseLayout(base: LayoutDoc | null, local: LayoutDoc, server: LayoutDoc): LayoutDoc {
  if (!base) return local
  const next: LayoutDoc = { ...server }
  if (!sameJson(local.id, base.id)) next.id = local.id
  if (!sameJson(local.title, base.title)) next.title = local.title
  if (!sameJson(local.layout, base.layout)) next.layout = local.layout
  if (!sameJson(local.focus, base.focus)) next.focus = local.focus
  if (!sameJson(local.zoom, base.zoom)) next.zoom = local.zoom
  if (!sameJson(local.createdBy, base.createdBy)) next.createdBy = local.createdBy
  return next
}

export type LayoutSaveGate = { inflight: boolean; trailing: boolean }

/** A keypress while a save is in flight becomes one trailing save, not another PUT. */
export function noteLayoutEdit(gate: LayoutSaveGate): LayoutSaveGate {
  if (!gate.inflight) return gate
  return { inflight: true, trailing: true }
}

export function finishLayoutSave(gate: LayoutSaveGate): { gate: LayoutSaveGate; again: boolean } {
  return { gate: { inflight: false, trailing: false }, again: gate.trailing }
}

export type VersionedLayoutSave<T> = {
  baseUpdatedAt: string | null
  baseDocument: T | null
  /** Document at the start of this save. */
  localDocument: T
  /** Newest document if the user edited while the first PUT was in flight. */
  latest: () => T
  put: (document: T, expectedUpdatedAt: string | null) => Promise<{ updated_at: string }>
  refetch: () => Promise<{ document: T | null; updated_at: string | null }>
  isConflict: (error: unknown) => boolean
  onConflict?: () => void
}

/**
 * PUT the layout with the version it was based on.
 * A stale write is a conflict: refetch, rebase the user's change, and retry once.
 */
export async function saveVersionedLayout<T extends LayoutDoc>(
  input: VersionedLayoutSave<T>,
): Promise<{ document: T; updated_at: string }> {
  try {
    const saved = await input.put(input.localDocument, input.baseUpdatedAt)
    return { document: input.localDocument, updated_at: saved.updated_at }
  } catch (error) {
    if (!input.isConflict(error)) throw error
    input.onConflict?.()
    const fresh = await input.refetch()
    const local = input.latest()
    const merged = fresh.document
      ? (rebaseLayout(input.baseDocument, local, fresh.document) as T)
      : local
    const saved = await input.put(merged, fresh.updated_at)
    return { document: merged, updated_at: saved.updated_at }
  }
}
