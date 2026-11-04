import { useEffect, useRef } from 'react'

/** URL search params that mirror what the shell is showing. */
export type UrlState = {
  ws?: string
  view?: string
  catalog?: string
  object?: string
}

export type UrlStateValues = {
  workspaceId: string | null
  viewId: string | null
  catalogId: string | null
  objectId: string | null
}

export type UrlStateValidity = {
  workspace: (id: string) => boolean
  view: (id: string) => boolean
  catalog: (id: string) => boolean
  object: (id: string) => boolean
}

export type UrlStateApply = Partial<UrlStateValues>
export type UrlStateNavigation = { search: UrlState; replace: boolean }

export const URL_STATE_PARAMS = ['ws', 'view', 'catalog', 'object'] as const
type Param = (typeof URL_STATE_PARAMS)[number]

const VALUE_KEY: Record<Param, keyof UrlStateValues> = {
  ws: 'workspaceId',
  view: 'viewId',
  catalog: 'catalogId',
  object: 'objectId',
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

/** Read known params from a router search object. Unknown params and types are ignored. */
export function parseUrlState(search: unknown): UrlState {
  const input = search && typeof search === 'object' && !Array.isArray(search)
    ? (search as Record<string, unknown>)
    : {}
  const state: UrlState = {}
  for (const param of URL_STATE_PARAMS) {
    const value = text(input[param])
    if (value !== undefined) state[param] = value
  }
  return state
}

/** Serialize app state to the slice of URL search params we own. */
export function serializeUrlState(values: UrlStateValues): UrlState {
  const state: UrlState = {}
  for (const param of URL_STATE_PARAMS) {
    const value = text(values[VALUE_KEY[param]])
    if (value !== undefined) state[param] = value
  }
  return state
}

export function urlStateKey(state: UrlState): string {
  return URL_STATE_PARAMS
    .map((param) => {
      const value = state[param]
      return value === undefined ? '' : `${param}=${encodeURIComponent(value)}`
    })
    .join('&')
}

export function sameUrlState(left: UrlState, right: UrlState): boolean {
  return urlStateKey(left) === urlStateKey(right)
}

/**
 * Keep app state and the index route search params in sync.
 *
 * App -> URL is driven by state changes; URL -> app only runs when the search
 * key actually changes (initial load, link, back/forward). That keeps a user
 * action in the app from being reverted by the previous URL value.
 */
export function useUrlStateSync(input: {
  search: unknown
  state: UrlStateValues
  ready: boolean
  valid: UrlStateValidity
  /** Views already in the layout. On first load these are not opened again. */
  viewOpen?: (id: string) => boolean
  navigate: (next: UrlStateNavigation) => void
  apply: (next: UrlStateApply) => void
}) {
  const { search, state, ready, valid, viewOpen, navigate, apply } = input
  const parsed = parseUrlState(search)
  const key = urlStateKey(parsed)
  const validRef = useRef(valid)
  validRef.current = valid
  const viewOpenRef = useRef(viewOpen)
  viewOpenRef.current = viewOpen
  const applyRef = useRef(apply)
  applyRef.current = apply
  const pending = useRef<Set<Param>>(new Set())
  const lastKey = useRef<string | null>(null)
  const justApplied = useRef(false)
  const synced = useRef(false)
  // A URL-derived change may need several renders (workspace data, then view)
  // before app state matches the URL. Never turn that settling into history.
  const settling = useRef(true)

  useEffect(() => {
    if (!ready) return
    if (lastKey.current !== key) {
      lastKey.current = key
      pending.current = new Set(URL_STATE_PARAMS.filter((param) => parsed[param] !== undefined))
      settling.current = true
    }
    if (pending.current.size === 0) return

    // A workspace switch must land before its view/catalog can be validated.
    const waitingForWorkspace = Boolean(
      parsed.ws
      && parsed.ws !== state.workspaceId
      && validRef.current.workspace(parsed.ws),
    )
    const changes: UrlStateApply = {}
    for (const param of [...pending.current]) {
      const value = parsed[param]
      if (!value) {
        pending.current.delete(param)
        continue
      }
      if (!isValid(param, value, validRef.current)) {
        pending.current.delete(param)
        continue
      }
      if ((param === 'view' || param === 'catalog') && waitingForWorkspace) continue
      // Reload restores the layout and its active view from storage. Re-opening
      // a view that is already open would remount its table and reload column
      // prefs; a stale URL view must not do that on first load.
      if (param === 'view' && !synced.current && viewOpenRef.current?.(value)) {
        pending.current.delete(param)
        continue
      }
      const stateKey = VALUE_KEY[param]
      if (state[stateKey] !== value) changes[stateKey] = value
      pending.current.delete(param)
    }
    if (Object.keys(changes).length > 0) {
      justApplied.current = true
      applyRef.current(changes)
    }
  }, [ready, key, state.workspaceId, state.viewId, state.catalogId, state.objectId, parsed.ws, parsed.view, parsed.catalog, parsed.object])

  useEffect(() => {
    if (!ready) return
    if (pending.current.size > 0) return
    if (justApplied.current) {
      justApplied.current = false
      return
    }
    const next = serializeUrlState(state)
    if (sameUrlState(parsed, next)) {
      settling.current = false
      synced.current = true
      return
    }
    // Catalog is a durable preference, not a navigation step. Workspace, view
    // and object changes are worth a Back entry once the initial URL is set.
    // While a URL-derived change settles, replace instead of pushing.
    const backWorthy =
      parsed.ws !== next.ws || parsed.view !== next.view || parsed.object !== next.object
    navigate({ search: next, replace: !synced.current || !backWorthy || settling.current })
    synced.current = true
  }, [ready, key, state.workspaceId, state.viewId, state.catalogId, state.objectId, parsed.ws, parsed.view, parsed.catalog, parsed.object])
}

function isValid(param: Param, value: string, valid: UrlStateValidity): boolean {
  if (param === 'ws') return valid.workspace(value)
  if (param === 'view') return valid.view(value)
  if (param === 'catalog') return valid.catalog(value)
  return valid.object(value)
}
