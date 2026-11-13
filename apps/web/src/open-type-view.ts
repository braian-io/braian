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
