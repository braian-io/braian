import type { Json } from './api'

export const OPEN_DELETE_OBJECTS = 'braian:open-delete-objects'

export type DeleteObjectRequest = { ids: string[] }

/** One confirm dialog and one host, whichever surface asked for the delete. */
export function requestDeleteObjects(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0 || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<DeleteObjectRequest>(OPEN_DELETE_OBJECTS, {
    detail: { ids: unique },
  }))
}

export type DeleteDryRun = {
  objects: number
  links: number
  sentence: string
  detail: string[]
}

export type DeleteCounts = {
  objects: number
  links: number
  sentence: string
  detail: string[]
}

type JsonRecord = { [key: string]: Json }

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function dryRunFrom(body: unknown): DeleteDryRun {
  const row = (body && typeof body === 'object' ? body : {}) as JsonRecord
  const detail = Array.isArray(row.detail) ? row.detail.map(String) : []
  return {
    objects: count(row.objects),
    links: count(row.links),
    sentence: typeof row.sentence === 'string' ? row.sentence : '',
    detail,
  }
}

/** Link object ids a live object currently takes part in, from its object body. */
export function linkedObjectIds(body: unknown): string[] {
  const row = (body && typeof body === 'object' ? body : {}) as JsonRecord
  const sides = Array.isArray(row.links) ? row.links : []
  const ids = new Set<string>()
  for (const side of sides) {
    if (!side || typeof side !== 'object') continue
    const items = (side as JsonRecord).links
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const id = String((item as JsonRecord).id ?? '')
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

/**
 * Selected objects are objects. Links they cascade-delete are links, never a
 * second object, and a link shared by two selected objects is counted once.
 * The sentence is built here so singular and plural stay correct whichever
 * surface opened the dialog.
 */
export function mergeDeleteCounts(
  ids: string[],
  dryRuns: Map<string, DeleteDryRun>,
  links: Map<string, string[]>,
): DeleteCounts {
  const selected = [...new Set(ids)]
  const chosen = new Set(selected)
  const linkIds = new Set<string>()
  let everyObjectLoaded = true
  for (const id of selected) {
    const linked = links.get(id)
    if (!linked) everyObjectLoaded = false
    for (const linkId of linked ?? []) {
      if (!chosen.has(linkId)) linkIds.add(linkId)
    }
  }
  // A single object's dry run already counted its live links. Use it only when
  // the object body could not supply the link ids, so a shared link is never
  // counted twice in a multi-selection.
  let linkCount = linkIds.size
  if (linkCount === 0 && selected.length === 1) {
    linkCount = dryRuns.get(selected[0])?.links ?? 0
  } else if (linkCount === 0 && !everyObjectLoaded) {
    linkCount = Math.max(0, ...selected.map((id) => dryRuns.get(id)?.links ?? 0))
  }
  const objects = selected.length
  return {
    objects,
    links: linkCount,
    sentence: `Removes ${objects} ${objects === 1 ? 'object' : 'objects'} and ${linkCount} ${linkCount === 1 ? 'link' : 'links'}`,
    detail: [],
  }
}
