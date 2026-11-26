import { freeObject, type Json } from './api'

export type TypeViewRow = {
  id: string
  type: string
  title: string
  pane?: string
  position?: number
  state: Json
}

export type ObjectTypeRef = {
  id: string
  key: string
}

function isObjectTableViewFor(view: TypeViewRow, type: ObjectTypeRef) {
  return view.type === 'object_table'
    && (String(view.state.object_type ?? '') === type.id || String(view.state.type_key ?? '') === type.key)
}

/**
 * The object table for `type` that is already in the layout. Closed views are
 * deliberately ignored: Add view must never reopen an old copy.
 */
export function objectTableViewForType(
  views: TypeViewRow[],
  type: ObjectTypeRef,
  openIds: string[],
): TypeViewRow | undefined {
  return views.find((view) => isObjectTableViewFor(view, type) && openIds.includes(view.id))
}

/**
 * The object table for this type. An open table wins over a closed one.
 * An empty id or key never matches, so a product is not sent to the first table.
 */
export function objectTableForTypeToken(
  views: readonly TypeViewRow[],
  type: { id?: string; key?: string },
  openIds: readonly string[] = [],
): TypeViewRow | undefined {
  const id = type.id?.trim() ?? ''
  const key = type.key?.trim() ?? ''
  if (!id && !key) return undefined
  const matches = views.filter((view) => {
    if (view.type !== 'object_table') return false
    const boundId = String(view.state.object_type ?? '').trim()
    const boundKey = String(view.state.type_key ?? '').trim()
    const idHit = id !== '' && (boundId === id || boundKey === id)
    const keyHit = key !== '' && (boundKey === key || boundId === key)
    return idHit || keyHit
  })
  return matches.find((view) => openIds.includes(view.id)) ?? matches[0]
}

/** Type id and key for an object body, using a hint from the control that opened it. */
export function draftTypeRef(
  body: { type?: unknown; type_key?: unknown; type_id?: unknown } | null | undefined,
  hinted: { id?: string; key?: string },
  types: readonly { id: string; key: string }[],
): { id: string; key: string } | null {
  const hintedId = hinted.id?.trim() ?? ''
  const hintedKey = hinted.key?.trim() ?? ''
  const bodyKey = String(body?.type_key ?? body?.type ?? '').trim()
  const bodyId = String(body?.type_id ?? '').trim()
  const named = types.find((item) =>
    (hintedId !== '' && item.id === hintedId)
    || (hintedKey !== '' && (item.key === hintedKey || item.id === hintedKey))
    || (bodyId !== '' && item.id === bodyId)
    || (bodyKey !== '' && (item.key === bodyKey || item.id === bodyKey)),
  )
  const id = named?.id || hintedId || bodyId
  const key = named?.key || hintedKey || (bodyKey && bodyKey !== id ? bodyKey : '')
  if (!id && !key) return null
  return { id, key }
}

/** Any object table for `type`, open or closed, used only as clone state. */
export function objectTableTemplateForType(
  views: TypeViewRow[],
  type: ObjectTypeRef,
): TypeViewRow | undefined {
  return views.find((view) => isObjectTableViewFor(view, type))
}

export function cloneObjectTableView(view: TypeViewRow, id: string, position: number): TypeViewRow {
  return {
    id,
    type: 'object_table',
    title: view.title,
    pane: 'center',
    position,
    state: freeObject({ ...view.state }),
  }
}
