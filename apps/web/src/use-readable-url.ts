import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MASTER_CATALOG_ID } from './catalog-ref'
import { useCatalogsQuery, type CatalogListRow } from './catalog-list'
import { listObjectsByIdPrefix, listObjectsWithKey } from './url-object'
import {
  objectTokenFor,
  publicToken,
  resolveObjectToken,
  resolvePublicToken,
  splitObjectToken,
  type KeyedId,
  type NamedId,
} from './url-public'
import { parseUrlState, useUrlStateSync, type UrlStateNavigation } from './url-state'

type ListObjects = typeof listObjectsWithKey
type ListObjectsByIdPrefix = typeof listObjectsByIdPrefix

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
  listObjectsByIdPrefix?: ListObjectsByIdPrefix
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

  const peers = useQuery({
    queryKey: ['url-object-peers', catalogKey, input.objectKey],
    enabled: Boolean(input.ready && input.objectKey && !input.objectTypeKey && catalogKey),
    queryFn: () => (input.listObjects ?? listObjectsWithKey)(catalogKey, input.objectKey ?? ''),
    staleTime: 5_000,
  })
  const emitted = emittedObjectToken(
    input.objectKey,
    input.objectId,
    input.objectLoaded,
    input.objectTypeKey,
    peers.data,
  )
  const held = useRef<{ objectId: string; token: string } | null>(null)
  if (!input.objectId || (input.objectLoaded && !input.objectKey)) held.current = null
  else if (emitted) held.current = { objectId: input.objectId, token: emitted }
  const heldToken = held.current && held.current.objectId === input.objectId ? held.current.token : null

  const [pinned, setPinned] = useState<string | null>(null)
  const failed = useRef(new Set<string>())
  const appliedObject = useRef<string | null>(null)
  const applyObjectRef = useRef(input.applyObject)
  applyObjectRef.current = input.applyObject
  const listRef = useRef(input.listObjects)
  listRef.current = input.listObjects
  const listByIdRef = useRef(input.listObjectsByIdPrefix)
  listByIdRef.current = input.listObjectsByIdPrefix
  const lookupSeq = useRef(0)
  const hookObject = pinned ?? (input.objectId ? (emitted ?? heldToken) : null)
  // A token change for the same object comes from resolution (rename or a
  // collision suffix), not from a new navigation step.
  const previous = useRef<{ objectId: string | null; token: string | null }>({ objectId: null, token: null })
  const resolutionReplace = Boolean(
    input.objectId
    && previous.current.objectId === input.objectId
    && previous.current.token
    && hookObject
    && previous.current.token !== hookObject,
  )
  previous.current = { objectId: input.objectId, token: hookObject }

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
      object: (token) => switchingWorkspace || !failed.current.has(failureKey(catalogKey, input.objectTypeKey, token)),
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
      if (next.objectId) setPinned(next.objectId)
    },
  })

  useEffect(() => {
    if (!pinned || !input.ready || !catalogs.isSuccess || !contextSettled || !catalogKey) return
    const token = pinned
    const typeKey = input.objectTypeKey
    const scope = catalogKey
    const seq = lookupSeq.current + 1
    lookupSeq.current = seq
    let cancel = false
    void lookupObjectToken(
      listRef.current ?? listObjectsWithKey,
      listByIdRef.current ?? listObjectsByIdPrefix,
      scope,
      token,
      typeKey,
    ).then((found) => {
      if (cancel || seq !== lookupSeq.current || !found.definitive) return
      if (!found.id) {
        failed.current.add(failureKey(scope, typeKey, token))
        setPinned((current) => current === token ? null : current)
        return
      }
      appliedObject.current = found.id
      applyObjectRef.current(found.id)
    }).catch(() => {
      // Leave the pin. A later catalog, type, or token change runs the lookup again.
    })
    return () => { cancel = true }
  }, [pinned, input.ready, catalogs.isSuccess, contextSettled, catalogKey, input.objectTypeKey])

  useEffect(() => {
    if (!input.objectId) return
    if (appliedObject.current === input.objectId) {
      appliedObject.current = null
      return
    }
    setPinned(null)
  }, [input.objectId])

  // Once we know the token the open object would emit, drop the URL pin so a
  // rename or a resolved collision suffix updates the address. Keep the pin
  // while a catalog-wide duplicate check is still loading, or the URL flickers.
  useEffect(() => {
    if (!pinned || !input.objectLoaded || !input.objectId) return
    if (!input.objectKey || emitted) setPinned(null)
  }, [pinned, input.objectLoaded, input.objectId, input.objectKey, emitted])
}

async function lookupObjectToken(
  list: ListObjects,
  listById: ListObjectsByIdPrefix,
  catalogKey: string,
  token: string,
  typeKey: string | null,
): Promise<{ id: string | null; definitive: boolean }> {
  const split = splitObjectToken(token)
  if (!split) return { id: null, definitive: true }
  if (!split.key) {
    if (!split.short) return { id: null, definitive: true }
    const page = await listById(catalogKey, split.short, typeKey)
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
): string | null {
  if (!objectId) return null
  if (objectKey) {
    if (typeKey) return objectKey
    if (!peers?.complete) return null
    return objectTokenFor({ id: objectId, key: objectKey }, peers.rows)
  }
  if (!objectLoaded) return null
  return objectTokenFor({ id: objectId, key: null }, [])
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

/** Type key for object resolution: the focused table, else the detail's list. */
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
    const key = (state as { type_key?: unknown }).type_key
    return typeof key === 'string' && key.trim() ? key.trim() : null
  }
  return of(focusId) ?? of(listId)
}
