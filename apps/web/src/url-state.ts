import { useEffect, useRef } from 'react'
import { takeObjectNavReplace } from './object-nav-signal'

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
  /** A resolution-driven write (for example a renamed key) replaces. */
  forceReplace?: boolean
  /** Uuid of the object being shown. Arrow replace applies only when it matches. */
  navObjectId?: string | null
  navigate: (next: UrlStateNavigation) => void
  apply: (next: UrlStateApply) => void
}) {
  const { search, state, ready, valid, viewOpen, forceReplace, navObjectId, navigate, apply } = input
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
  // The last state we sent to the router, and whether the location has caught
  // up. Two quick updates must not both push a Back entry.
  const lastWritten = useRef<string | null>(null)
  const navigationInFlight = useRef(false)

  useEffect(() => {
    const onPop = () => {
      lastWritten.current = null
      navigationInFlight.current = false
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (lastKey.current !== key) {
      lastKey.current = key
      pending.current = new Set(URL_STATE_PARAMS.filter((param) => parsed[param] !== undefined))
      settling.current = true
      // Only treat the location as caught up when it matches the last write. An
      // intermediate object token from a fast arrow burst must not clear inFlight.
      if (lastWritten.current === key) {
        lastWritten.current = null
        navigationInFlight.current = false
      }
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
      // A router write can lag behind fast table arrows. Do not pin a stale object
      // token from the URL while the outgoing navigation is still in flight.
      if (param === 'object' && navigationInFlight.current) continue
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
    const nextKey = urlStateKey(next)
    if (sameUrlState(parsed, next)) {
      settling.current = false
      synced.current = true
      if (lastWritten.current === nextKey) {
        lastWritten.current = null
        navigationInFlight.current = false
      }
      return
    }
    // The router has not applied our previous write yet. Never push the same
    // state twice; a newer state replaces the pending entry instead.
    if (lastWritten.current === nextKey) return
    // Catalog is a durable preference, not a navigation step. Workspace, view
    // and object changes are worth a Back entry once the initial URL is set.
    // While a URL-derived change settles, or a write is still in flight,
    // replace instead of pushing.
    const backWorthy =
      parsed.ws !== next.ws || parsed.view !== next.view || parsed.object !== next.object
    const objectOnly =
      parsed.ws === next.ws
      && parsed.view === next.view
      && parsed.catalog === next.catalog
      && parsed.object !== next.object
    const arrowReplace = objectOnly && takeObjectNavReplace(navObjectId)
    navigate({
      search: next,
      replace: Boolean(forceReplace)
        || arrowReplace
        || !synced.current
        || !backWorthy
        || settling.current
        || navigationInFlight.current,
    })
    lastWritten.current = nextKey
    navigationInFlight.current = true
    synced.current = true
  }, [ready, key, state.workspaceId, state.viewId, state.catalogId, state.objectId, parsed.ws, parsed.view, parsed.catalog, parsed.object, forceReplace, navObjectId])
}

function isValid(param: Param, value: string, valid: UrlStateValidity): boolean {
  if (param === 'ws') return valid.workspace(value)
  if (param === 'view') return valid.view(value)
  if (param === 'catalog') return valid.catalog(value)
  return valid.object(value)
}
