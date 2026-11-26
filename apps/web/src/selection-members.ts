import type { QueryClient } from '@tanstack/react-query'
import { api, type Json } from './api'
import { memberIdFilter, memberIdsOf } from './assortment-filter'
import { endLinkDrag, linkDragActive, linkDragMime, linkDragPayload, readLinkDrag } from './link-drag'

export const SELECTION_MEMBERS_EVENT = 'braian-selection-members'

export type SelectionMembersDetail = { id: string; memberIds: string[] }

type MemberError = { selectionId: string; message: string }

let memberError: MemberError = { selectionId: '', message: '' }
const errorListeners = new Set<() => void>()

export function memberErrorSnapshot(): MemberError {
  return memberError
}

export function subscribeMemberError(listener: () => void): () => void {
  errorListeners.add(listener)
  return () => errorListeners.delete(listener)
}

export function setMemberError(selectionId: string, message: string) {
  memberError = { selectionId, message }
  for (const listener of errorListeners) listener()
}

export function clearMemberError() {
  if (!memberError.message) return
  memberError = { selectionId: '', message: '' }
  for (const listener of errorListeners) listener()
}

export function objectIdsFromTarget(target: { objectId?: unknown; objects?: unknown }): string[] {
  const objects = target.objects
  if (Array.isArray(objects)) {
    const ids: string[] = []
    for (const item of objects) {
      if (item && typeof item === 'object' && 'id' in item) {
        const id = String((item as { id: unknown }).id)
        if (id && !ids.includes(id)) ids.push(id)
      }
    }
    if (ids.length > 0) return ids
  }
  const id = target.objectId ? String(target.objectId) : ''
  return id ? [id] : []
}

/** More than one row asks before it leaves the selection. One row does not. */
export function needsRemoveConfirm(count: number): boolean {
  return count > 1
}

export function droppedObjectIds(data: DataTransfer): string[] {
  const parsed = readLinkDrag(data.getData(linkDragMime))
  const objects = parsed.length > 0 ? parsed : linkDragPayload()
  const ids: string[] = []
  for (const item of objects) {
    if (item.id && !ids.includes(item.id)) ids.push(item.id)
  }
  return ids
}

export function selectionDragActive(types: ArrayLike<string>): boolean {
  return linkDragActive(types)
}

export function publishSelectionMembers(id: string, memberIds: string[]) {
  if (typeof window === 'undefined') return
  const detail: SelectionMembersDetail = { id, memberIds }
  window.dispatchEvent(new CustomEvent(SELECTION_MEMBERS_EVENT, { detail }))
}

function handQuery(query: unknown): Json {
  const next: Json = {}
  if (query && typeof query === 'object' && !Array.isArray(query)) {
    for (const [key, value] of Object.entries(query as Json)) {
      if (key === 'group' || key === 'labels' || key === 'filter') continue
      next[key] = value
    }
  }
  next.hand = true
  return next
}

export function writeMemberCache(
  queryClient: QueryClient,
  id: string,
  memberIds: string[],
  hand: boolean,
) {
  queryClient.setQueriesData({ queryKey: ['assortments'] }, (current: unknown) => {
    if (!current || typeof current !== 'object') return current
    const record = current as { assortments?: Json[] }
    if (!Array.isArray(record.assortments)) return current
    return {
      ...record,
      assortments: record.assortments.map((item) => {
        if (String(item.id) !== id) return item
        return {
          ...item,
          member_ids: memberIds,
          ...(hand ? { query: handQuery(item.query) } : {}),
        }
      }),
    }
  })
}

export async function changeSelectionMembers(
  id: string,
  objectIds: string[],
  op: 'add' | 'remove',
): Promise<string[]> {
  const init = { params: { path: { id } }, body: { object_ids: objectIds } }
  const result = op === 'add'
    ? await api.post('/v1/assortments/{id}/members', init)
    : await api.delete('/v1/assortments/{id}/members', init)
  const ids = result && typeof result === 'object' && 'member_ids' in result ? result.member_ids : []
  return Array.isArray(ids) ? ids.map(String) : []
}

export async function saveSelectionMembers(
  queryClient: QueryClient,
  id: string,
  objectIds: string[],
  op: 'add' | 'remove',
): Promise<string[]> {
  const memberIds = await changeSelectionMembers(id, objectIds, op)
  writeMemberCache(queryClient, id, memberIds, op === 'add')
  publishSelectionMembers(id, memberIds)
  clearMemberError()
  void queryClient.invalidateQueries({ queryKey: ['assortments'] })
  return memberIds
}

export function selectionMemberFilter(item: { member_ids?: unknown; query?: unknown }): string | null {
  const members = memberIdsOf(item)
  if (members.length === 0) return null
  return memberIdFilter(members)
}

/** Drop ends the drag gesture so a link dialog does not also open. */
export function finishSelectionDrop(data: DataTransfer): string[] {
  const ids = droppedObjectIds(data)
  endLinkDrag()
  return ids
}
