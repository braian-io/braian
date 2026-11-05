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

export function objectTableViewForType(
  views: TypeViewRow[],
  type: ObjectTypeRef,
  openIds: string[],
): TypeViewRow | undefined {
  const matches = views.filter((view) => isObjectTableViewFor(view, type))
  return matches.find((view) => !openIds.includes(view.id)) ?? matches[0]
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
