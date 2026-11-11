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
 * One object can reuse the server's sentence and detail. Several objects are
 * merged through the link object ids they share, so a link touched by two
 * selected objects is counted once.
 */
export function mergeDeleteCounts(
  ids: string[],
  dryRuns: Map<string, DeleteDryRun>,
  links: Map<string, string[]>,
): DeleteCounts {
  const selected = [...new Set(ids)]
  if (selected.length === 1) {
    const run = dryRuns.get(selected[0])
    if (run) return { objects: run.objects, links: run.links, sentence: run.sentence, detail: run.detail }
  }
  const chosen = new Set(selected)
  const linkIds = new Set<string>()
  for (const id of selected) {
    for (const linkId of links.get(id) ?? []) {
      if (!chosen.has(linkId)) linkIds.add(linkId)
    }
  }
  const objects = chosen.size + linkIds.size
  const linkCount = linkIds.size
  return {
    objects,
    links: linkCount,
    sentence: `Removes ${objects} objects and ${linkCount} links`,
    detail: [],
  }
}
