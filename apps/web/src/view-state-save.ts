/** Top-level view state. A null value removes that key on the server. */
export type ViewState = Record<string, unknown>

export type ViewPostBody = {
  id: string
  workspace_id: string
  type: string
  title: string
  pane: string
  position: number
  state: ViewState
  /** Absent when the client has not seen a version. Null means it saw no row. */
  expected_updated_at?: string | null
}

export function viewStateRecord(value: unknown): ViewState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as ViewState) }
}

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

/** Overlay `patch` onto `stored`. A null value removes the key. */
export function applyViewPatch(stored: ViewState, patch: ViewState): ViewState {
  const next: ViewState = { ...stored }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next
}

/**
 * Keys that differ between the document the edit started from and the document
 * the user wants. A key removed from `local` is null so the server drops it.
 * A null base means the user started from an empty document.
 */
export function viewStatePatch(base: ViewState | null, local: ViewState): ViewState {
  if (!base) return { ...local }
  const patch: ViewState = {}
  const keys = new Set([...Object.keys(base), ...Object.keys(local)])
  for (const key of keys) {
    const next = Object.prototype.hasOwnProperty.call(local, key) ? local[key] : null
    const prev = Object.prototype.hasOwnProperty.call(base, key) ? base[key] : null
    if (!sameJson(next, prev)) patch[key] = next
  }
  return patch
}

/**
 * Pending keys win. Everything the user left alone stays on the server copy.
 */
export function rebaseViewState(base: ViewState | null, local: ViewState, server: ViewState): ViewState {
  return applyViewPatch(server, viewStatePatch(base, local))
}

export type VersionedViewKeys = {
  baseUpdatedAt: string | null | undefined
  pending: ViewState
  /** Newest pending keys if the user edited while the first POST was in flight. */
  latestPending: () => ViewState
  post: (patch: ViewState, expectedUpdatedAt: string | null | undefined) => Promise<{ updated_at: string }>
  refetch: () => Promise<{ state: ViewState; updated_at: string | null }>
  isConflict: (error: unknown) => boolean
  onConflict?: () => void
}

/**
 * POST the pending keys with the version they were based on.
 * A stale write is a conflict: refetch, keep those keys, and retry once.
 */
export async function saveVersionedViewKeys(
  input: VersionedViewKeys,
): Promise<{ updated_at: string; pending: ViewState }> {
  try {
    const saved = await input.post(input.pending, input.baseUpdatedAt)
    return { updated_at: saved.updated_at, pending: input.pending }
  } catch (error) {
    if (!input.isConflict(error)) throw error
    input.onConflict?.()
    const fresh = await input.refetch()
    const pending = input.latestPending()
    const saved = await input.post(pending, fresh.updated_at)
    return { updated_at: saved.updated_at, pending }
  }
}

export type ViewChange = {
  id: string
  workspaceId: string
  type: string
  title: string
  pane: string
  position: number
  baseState: ViewState
  nextState: ViewState
  /** Undefined when this client has not seen `updated_at` yet. */
  updatedAt: string | null | undefined
  post: (body: ViewPostBody) => Promise<{ updated_at: string }>
  refetch: () => Promise<{ state: ViewState; updated_at: string | null }>
  isConflict: (error: unknown) => boolean
  onConflict?: () => void
}

/** Save the keys that differ. An empty diff does not POST. */
export async function saveViewChange(input: ViewChange): Promise<{ state: ViewState; updated_at: string | null }> {
  const pending = viewStatePatch(input.baseState, input.nextState)
  if (Object.keys(pending).length === 0) {
    return { state: input.nextState, updated_at: input.updatedAt ?? null }
  }
  let expected = input.updatedAt
  if (expected === undefined) {
    expected = (await input.refetch()).updated_at
  }
  const saved = await saveVersionedViewKeys({
    baseUpdatedAt: expected,
    pending,
    latestPending: () => pending,
    post: (patch, expectedUpdatedAt) => input.post({
      id: input.id,
      workspace_id: input.workspaceId,
      type: input.type,
      title: input.title,
      pane: input.pane,
      position: input.position,
      state: patch,
      ...(expectedUpdatedAt !== undefined ? { expected_updated_at: expectedUpdatedAt } : {}),
    }),
    refetch: input.refetch,
    isConflict: input.isConflict,
    onConflict: input.onConflict,
  })
  return {
    state: applyViewPatch(input.baseState, saved.pending),
    updated_at: saved.updated_at,
  }
}

export type ViewKeyTarget = {
  id: string
  workspaceId: string
  type: string
  title: string
  pane?: string
  position?: number
  updatedAt?: string | null
}

type ViewSlot = {
  identity: {
    id: string
    workspace_id: string
    type: string
    title: string
    pane: string
    position: number
  }
  patch: ViewState
  baseUpdatedAt: string | null | undefined
  knownVersion: boolean
  timer: ReturnType<typeof setTimeout> | null
  inflight: boolean
}

export type ViewKeySaver = {
  schedule: (view: ViewKeyTarget, patch: ViewState) => void
  flush: (viewId?: string) => void
}

/**
 * Coalesce rapid edits so one POST carries the latest value of each key.
 * A change that arrives while that POST is in flight is sent once afterwards.
 */
export function createViewKeySaver(options: {
  delayMs?: number
  post: (body: ViewPostBody) => Promise<{ updated_at: string }>
  refetch: (viewId: string) => Promise<{ state: ViewState; updated_at: string | null }>
  isConflict: (error: unknown) => boolean
  onConflict?: () => void
  onError?: (error: unknown) => void
  onSaved?: (viewId: string, updatedAt: string, patch: ViewState) => void
}): ViewKeySaver {
  const delayMs = options.delayMs ?? 80
  const slots = new Map<string, ViewSlot>()

  const send = (id: string) => {
    const slot = slots.get(id)
    if (!slot || slot.inflight) return
    if (slot.timer != null) {
      clearTimeout(slot.timer)
      slot.timer = null
    }
    const patch = { ...slot.patch }
    if (Object.keys(patch).length === 0) return
    slot.patch = {}
    slot.inflight = true
    const finish = (error?: unknown) => {
      slot.inflight = false
      if (error) {
        slot.patch = { ...patch, ...slot.patch }
        options.onError?.(error)
      }
      if (Object.keys(slot.patch).length > 0) send(id)
    }
    const run = async () => {
      if (!slot.knownVersion) {
        const fresh = await options.refetch(id)
        slot.baseUpdatedAt = fresh.updated_at
        slot.knownVersion = true
      }
      const saved = await saveVersionedViewKeys({
        baseUpdatedAt: slot.baseUpdatedAt,
        pending: patch,
        latestPending: () => ({ ...patch, ...slot.patch }),
        post: (state, expectedUpdatedAt) => options.post({
          ...slot.identity,
          state,
          ...(expectedUpdatedAt !== undefined ? { expected_updated_at: expectedUpdatedAt } : {}),
        }),
        refetch: () => options.refetch(id),
        isConflict: options.isConflict,
        onConflict: options.onConflict,
      })
      slot.baseUpdatedAt = saved.updated_at
      slot.knownVersion = true
      for (const [key, value] of Object.entries(saved.pending)) {
        if (sameJson(slot.patch[key], value)) delete slot.patch[key]
      }
      options.onSaved?.(id, saved.updated_at, saved.pending)
    }
    void run().then(() => finish()).catch((error: unknown) => finish(error))
  }

  const schedule = (view: ViewKeyTarget, patch: ViewState) => {
    let slot = slots.get(view.id)
    if (!slot) {
      slot = {
        identity: {
          id: view.id,
          workspace_id: view.workspaceId,
          type: view.type,
          title: view.title,
          pane: view.pane ?? 'center',
          position: view.position ?? 0,
        },
        patch: {},
        baseUpdatedAt: view.updatedAt,
        knownVersion: view.updatedAt !== undefined,
        timer: null,
        inflight: false,
      }
      slots.set(view.id, slot)
    }
    slot.identity = {
      id: view.id,
      workspace_id: view.workspaceId,
      type: view.type,
      title: view.title,
      pane: view.pane ?? 'center',
      position: view.position ?? 0,
    }
    for (const [key, value] of Object.entries(patch)) slot.patch[key] = value
    if (slot.inflight) return
    if (slot.timer != null) clearTimeout(slot.timer)
    slot.timer = setTimeout(() => {
      slot.timer = null
      send(view.id)
    }, delayMs)
  }

  const flush = (viewId?: string) => {
    const ids = viewId ? [viewId] : [...slots.keys()]
    for (const id of ids) send(id)
  }

  return { schedule, flush }
}
