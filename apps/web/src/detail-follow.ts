import { useEffect, useMemo, useRef } from 'react'
import { views as layoutViews, type LayoutDoc } from './layout'
import { readSelection, type SelectedObject } from './ui-context'

export type DetailFollowDoc = Pick<LayoutDoc, 'layout' | 'focus' | 'zoom'>
export type DetailFollowView = { id: string; type: string }

/** The list a detail panel follows: the focused table, else the last list still open, else the first table. */
export function activeListOf(
  doc: DetailFollowDoc,
  viewList: readonly DetailFollowView[],
  previous: string | null,
): string | null {
  const open = doc.zoom ? [doc.zoom] : layoutViews(doc.layout)
  const tables = new Set(
    viewList.filter((view) => view.type === 'object_table').map((view) => view.id),
  )
  const lists = open.filter((id) => tables.has(id))
  if (doc.focus && lists.includes(doc.focus)) return doc.focus
  if (previous && lists.includes(previous)) return previous
  return lists[0] ?? null
}

/** Keep the shown object when the active list contains it; otherwise take that list's row (or none). */
export function detailForSelection(
  objectId: string | null,
  selection: readonly SelectedObject[],
): string | null {
  if (objectId && selection.some((row) => row.id === objectId)) return objectId
  return selection[0]?.id ?? null
}

/**
 * Bind the detail object to the active list. Switching lists resets the detail
 * to that list's selected row, or clears it when the list has no selection.
 */
export function useDetailFollow(
  doc: DetailFollowDoc | null,
  viewList: readonly DetailFollowView[],
  ready: boolean,
  setObjectId: (update: (current: string | null) => string | null) => void,
) {
  const previousList = useRef<string | null>(null)
  const boundList = useRef<string | null>(null)
  const listId = useMemo(() => {
    if (!doc || !ready) return null
    const next = activeListOf(doc, viewList, previousList.current)
    previousList.current = next
    return next
  }, [doc, viewList, ready])
  useEffect(() => {
    if (!listId) {
      boundList.current = null
      return
    }
    if (boundList.current === listId) return
    boundList.current = listId
    setObjectId((current) => detailForSelection(current, readSelection(listId)))
  }, [listId, setObjectId])
  return listId
}
