import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MASTER_CATALOG_ID } from './catalog-ref'
import { useCatalogsQuery, type CatalogListRow } from './catalog-list'
import { listObjectsByIdSuffix, listObjectsWithKey } from './url-object'
import {
  encodeObjectKey,
  objectTokenFor,
  publicToken,
  resolveObjectToken,
  resolvePublicToken,
  shortId,
  splitObjectToken,
  type KeyedId,
  type NamedId,
} from './url-public'
import { parseUrlState, useUrlStateSync, type UrlStateNavigation } from './url-state'

type ListObjects = typeof listObjectsWithKey
type ListObjectsByIdSuffix = typeof listObjectsByIdSuffix

export function useReadableUrl(input: {
  search: unknown
  ready: boolean
  /** False on the login screen so the catalog list is not cached from a 401. */
  catalogsEnabled: boolean
  workspaceId: string | null
  workspaces: readonly NamedId[]
  viewId: string | null
  views: readonly NamedId[]
  /** Open view ids. A view that is already open is not opened again. */
  openViewIds: readonly string[]
  catalogId: string | null
  /** Type key of the focused table, else of the list the detail follows. */
  objectTypeKey: string | null
  /** Type key of a view id, so a URL object resolves in the view the URL names. */
  viewTypeKey?: (viewId: string) => string | null
  objectId: string | null
  /** Current object key once that object's body is loaded. Null while loading. */
  objectKey: string | null
  /** True when the object body has loaded for `objectId` (even if it has no key). */
  objectLoaded: boolean
  navigate: (next: UrlStateNavigation) => void
  applyWorkspace: (id: string) => void
  applyView: (id: string) => void
  applyCatalog: (id: string) => void
  applyObject: (id: string) => void
  listObjects?: ListObjects
  listObjectsByIdSuffix?: ListObjectsByIdSuffix
  /** Former name for `listObjectsByIdSuffix`, kept for callers/tests. */
  listObjectsByIdPrefix?: ListObjectsByIdSuffix
}) {
  const catalogs = useCatalogsQuery(input.catalogsEnabled)
  const catalogRows = catalogNames(catalogs.data)
  const catalogKey = catalogApiKey(input.catalogId, catalogs.data)
  const parsed = parseUrlState(input.search)
  const wsToken = publicToken(input.workspaces, input.workspaceId)
  const viewToken = publicToken(input.views, input.viewId)
  const catalogToken = publicToken(catalogRows, input.catalogId)
  const urlWorkspaceId = parsed.ws ? resolvePublicToken(input.workspaces, parsed.ws) : null
  const switchingWorkspace = Boolean(urlWorkspaceId && urlWorkspaceId !== input.workspaceId)
  const viewTypeRef = useRef(input.viewTypeKey)
  viewTypeRef.current = input.viewTypeKey
  const urlViewId = parsed.view ? resolvePublicToken(input.views, parsed.view) : null
  const urlViewTypeKey = urlViewId ? (viewTypeRef.current?.(urlViewId) ?? null) : null
  const listById = input.listObjectsByIdSuffix ?? input.listObjectsByIdPrefix

  const peers = useQuery({
    queryKey: ['url-object-peers', catalogKey, input.objectKey],
    enabled: Boolean(input.ready && input.objectKey && !input.objectTypeKey && catalogKey),
    queryFn: () => (input.listObjects ?? listObjectsWithKey)(catalogKey, input.objectKey ?? ''),
    staleTime: 5_000,
  })
  // Keyless rows (link objects) have no key to scope a peer lookup. Their token
  // is the shortest unique id suffix, so fetch every keyless row that shares
  // the base 8-hex tail. A complete answer extends the suffix when needed.
  const keylessPeers = useQuery({
    queryKey: ['url-keyless-peers', catalogKey, input.objectId],
    enabled: Boolean(input.ready && input.objectId && input.objectLoaded && !input.objectKey && catalogKey),
    queryFn: () => (listById ?? listObjectsByIdSuffix)(catalogKey, shortId(input.objectId ?? ''), null),
    staleTime: 5_000,
  })
  const emitted = emittedObjectToken(
    input.objectKey,
    input.objectId,
    input.objectLoaded,
    input.objectTypeKey,
    peers.data,
    keylessPeers.data,
  )
  const held = useRef<{ objectId: string; token: string } | null>(null)
  const heldScope = useRef<string | null>(null)
  const objectScope = `${wsToken ?? ''}\u0000${catalogKey ?? ''}`
  if (heldScope.current !== objectScope) {
    held.current = null
    heldScope.current = objectScope
  }
  if (!input.objectId || (input.objectLoaded && !input.objectKey)) held.current = null
  else if (emitted) held.current = { objectId: input.objectId, token: emitted }
  // Keep the previous token while the next object's body loads. Dropping it
  // would remove `object` from the URL for a render and push a no-object entry.
  const heldToken = held.current
    ? held.current.objectId === input.objectId || !input.objectLoaded
      ? held.current.token
      : null
    : null

  const [pinned, setPinned] = useState<string | null>(null)
  // The view the URL object came with, kept while the URL may rewrite `view`
  // to the current focus. Its type scopes the lookup.
  const pinnedView = useRef<string | null>(null)
  const failed = useRef(new Set<string>())
  const appliedObject = useRef<string | null>(null)
  const applyObjectRef = useRef(input.applyObject)
  applyObjectRef.current = input.applyObject
  const listRef = useRef(input.listObjects)
  listRef.current = input.listObjects
  const listByIdRef = useRef(listById)
  listByIdRef.current = listById
  const lookupSeq = useRef(0)
  // True while the lookup for the current pin is in flight. A table that
  // auto-selects a row before the URL object resolves must not drop the pin.
  const resolving = useRef(false)
  const hookObject = pinned ?? (input.objectId ? (emitted ?? heldToken) : null)
  // A token change for the same object comes from resolution (rename or a
  // collision suffix), not from a new navigation step. Only a token this
  // object actually emitted counts; a held token may still belong to the
  // object the user just left. While the next token is not ready (for example
  // a catalog-wide duplicate check) keep the last emitted token so the rename
  // is still detected when it arrives.
  const lastEmitted = useRef<{ objectId: string; token: string } | null>(null)
  const rename = useRef<{ objectId: string; token: string } | null>(null)
  if (!input.objectId) {
    lastEmitted.current = null
    rename.current = null
  } else if (emitted) {
    const previous = lastEmitted.current
    if (previous && previous.objectId === input.objectId && previous.token !== emitted) {
      rename.current = { objectId: input.objectId, token: emitted }
    }
    lastEmitted.current = { objectId: input.objectId, token: emitted }
  }
  if (rename.current && rename.current.objectId !== input.objectId) rename.current = null
  const resolutionReplace = Boolean(rename.current && rename.current.objectId === input.objectId)
  if (resolutionReplace && parsed.object === rename.current!.token) rename.current = null

  const contextSettled = contextsMatch(parsed, {
    ws: wsToken,
    view: viewToken,
    catalog: catalogToken,
  }, catalogs.isSuccess)

  useUrlStateSync({
    search: input.search,
    ready: input.ready && catalogs.isSuccess,
    state: {
      workspaceId: wsToken,
      viewId: viewToken,
      catalogId: catalogToken,
      objectId: hookObject,
    },
    valid: {
      workspace: (token) => resolvePublicToken(input.workspaces, token) != null,
      view: (token) => switchingWorkspace || resolvePublicToken(input.views, token) != null,
      catalog: (token) => switchingWorkspace || resolvePublicToken(catalogRows, token) != null,
      object: (token) => switchingWorkspace || !failed.current.has(failureKey(catalogKey, urlViewTypeKey ?? input.objectTypeKey, token)),
    },
    viewOpen: (token) => {
      if (switchingWorkspace) return false
      const id = resolvePublicToken(input.views, token)
      return Boolean(id && input.openViewIds.includes(id))
    },
    forceReplace: resolutionReplace,
    navigate: input.navigate,
    apply: (next) => {
      if (next.workspaceId) {
        const id = resolvePublicToken(input.workspaces, next.workspaceId)
        if (id) input.applyWorkspace(id)
      }
      if (next.viewId) {
        const id = resolvePublicToken(input.views, next.viewId)
        if (id) input.applyView(id)
      }
      if (next.catalogId) {
        const id = resolvePublicToken(catalogRows, next.catalogId)
        if (id) input.applyCatalog(id)
      }
      if (next.objectId) {
        appliedObject.current = null
        pinnedView.current = next.viewId ? resolvePublicToken(input.views, next.viewId) : null
        setPinned(next.objectId)
      }
    },
  })

  useEffect(() => {
    if (!pinned) {
      resolving.current = false
      return
    }
    // A pin stays resolving until it is resolved or rejected, even while the
    // workspace/view/type context is still settling. A table that selects a
    // row in that window must not drop the URL object.
    resolving.current = true
    if (!input.ready || !catalogs.isSuccess || !contextSettled || !catalogKey) return
    const token = pinned
    const typeKey = (pinnedView.current ? viewTypeRef.current?.(pinnedView.current) ?? null : null)
      ?? urlViewTypeKey
      ?? input.objectTypeKey
    const scope = catalogKey
    const seq = lookupSeq.current + 1
    lookupSeq.current = seq
    let cancel = false
    void lookupObjectToken(
      listRef.current ?? listObjectsWithKey,
      listByIdRef.current ?? listObjectsByIdSuffix,
      scope,
      token,
      typeKey,
    ).then((found) => {
      if (cancel || seq !== lookupSeq.current) return
      resolving.current = false
      if (!found.definitive) return
      if (!found.id) {
        failed.current.add(failureKey(scope, typeKey, token))
        appliedObject.current = null
        pinnedView.current = null
        setPinned((current) => current === token ? null : current)
        return
      }
      appliedObject.current = found.id
      applyObjectRef.current(found.id)
    }).catch(() => {
      if (seq === lookupSeq.current) resolving.current = false
      // Leave the pin. A later catalog, type, or token change runs the lookup again.
    })
    return () => { cancel = true }
  }, [pinned, input.ready, catalogs.isSuccess, contextSettled, catalogKey, input.objectTypeKey, urlViewTypeKey])

  useEffect(() => {
    if (!input.objectId) return
    // The pin has already been applied to this object; keep it until its token
    // is known and the URL reflects it.
    if (appliedObject.current === input.objectId) return
    if (resolving.current) return
    appliedObject.current = null
    pinnedView.current = null
    setPinned(null)
  }, [input.objectId])

  // Once the pinned object is open and we know the token it would emit, drop
  // the pin so a rename or a resolved collision suffix updates the address.
  // Keep it while a lookup or a catalog-wide duplicate check is still loading.
  useEffect(() => {
    if (!pinned || !input.objectLoaded || !input.objectId) return
    if (appliedObject.current !== input.objectId) return
    // Wait for the token this object would emit. A keyless row needs its
    // keyless peer lookup before the suffix is known; dropping the pin early
    // would remove `object` from the URL for a render.
    if (emitted) {
      appliedObject.current = null
      pinnedView.current = null
      setPinned(null)
    }
  }, [pinned, input.objectLoaded, input.objectId, input.objectKey, emitted])
}

async function lookupObjectToken(
  list: ListObjects,
  listById: ListObjectsByIdSuffix,
  catalogKey: string,
  token: string,
  typeKey: string | null,
): Promise<{ id: string | null; definitive: boolean }> {
  const split = splitObjectToken(token)
  if (!split) return { id: null, definitive: true }
  if (!split.key) {
    if (!split.short) return { id: null, definitive: true }
    // A link object has its own link type, not the table's type. Narrow only
    // by catalog; the random id suffix is the scope. Query the base 8-hex
    // tail so every row that could share an extended suffix is in the group.
    const page = await listById(catalogKey, split.short.slice(-8), null)
    if (!page.complete) return { id: null, definitive: false }
    return { id: resolveObjectToken(page.rows, token), definitive: true }
  }
  const page = await list(catalogKey, split.key, typeKey)
  if (!page.complete) return { id: null, definitive: false }
  return { id: resolveObjectToken(page.rows, token), definitive: true }
}

function emittedObjectToken(
  objectKey: string | null,
  objectId: string | null,
  objectLoaded: boolean,
  typeKey: string | null,
  peers: { rows: KeyedId[]; complete: boolean } | undefined,
  keylessPeers: { rows: KeyedId[]; complete: boolean } | undefined,
): string | null {
  if (!objectId) return null
  if (objectKey) {
    // A type scope makes the key unique, so no peer lookup is needed. Escape a
    // literal `~` exactly as the resolver does; returning the raw key would
    // read `A~deadbeef` as the key `A` plus a suffix.
    if (typeKey) return encodeObjectKey(objectKey)
    if (!peers?.complete) return null
    return objectTokenFor({ id: objectId, key: objectKey }, peers.rows)
  }
  if (!objectLoaded) return null
  if (!keylessPeers?.complete) return null
  return objectTokenFor({ id: objectId, key: null }, keylessPeers.rows)
}

function contextsMatch(
  parsed: { ws?: string; view?: string; catalog?: string },
  current: { ws: string | null; view: string | null; catalog: string | null },
  catalogsReady: boolean,
): boolean {
  if (!catalogsReady) return false
  if (parsed.ws && parsed.ws !== current.ws) return false
  if (parsed.view && parsed.view !== current.view) return false
  if (parsed.catalog && parsed.catalog !== current.catalog) return false
  return true
}

function failureKey(catalogKey: string, typeKey: string | null, token: string): string {
  return `${catalogKey}|${typeKey ?? ''}|${token}`
}

export function catalogNames(rows: readonly CatalogListRow[] | undefined): NamedId[] {
  const named: NamedId[] = []
  for (const row of rows ?? []) {
    if (!row.id) continue
    const label = row.name?.trim() || row.key?.trim() || ''
    if (!label) continue
    named.push({ id: row.id, label })
  }
  if (!named.some((row) => row.id === MASTER_CATALOG_ID)) {
    named.push({ id: MASTER_CATALOG_ID, label: 'Master catalog' })
  }
  return named
}

export function catalogApiKey(catalogId: string | null, rows: readonly CatalogListRow[] | undefined): string {
  if (!catalogId || catalogId === MASTER_CATALOG_ID) return 'master'
  const found = (rows ?? []).find((row) => row.id === catalogId)
  return found?.key?.trim() || ''
}

/** Type key or id for object resolution: the focused table, else the detail's list. */
export function urlObjectTypeKey(
  focusId: string | null,
  listId: string | null,
  views: readonly { id: string; type: string; state?: unknown }[],
): string | null {
  const of = (id: string | null) => {
    if (!id) return null
    const view = views.find((item) => item.id === id)
    if (!view || view.type !== 'object_table') return null
    const state = view.state
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null
    const record = state as { type_key?: unknown; object_type?: unknown }
    const key = typeof record.type_key === 'string' && record.type_key.trim()
      ? record.type_key
      : record.object_type
    return typeof key === 'string' && key.trim() ? key.trim() : null
  }
  return of(focusId) ?? of(listId)
}
