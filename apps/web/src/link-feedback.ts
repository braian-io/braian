import { flashObject } from './flash'

export type LinkFeedbackDetail = {
  /** Object whose link sections should show the hint and row highlight. */
  sectionObjectId: string
  linkType?: string
  direction?: 'out' | 'in'
  peerKeys: string[]
  hint?: string
  /** Table rows that should flash briefly after the link is created. */
  tableObjectIds?: string[]
}

export const LINK_FEEDBACK_EVENT = 'braian-link-feedback'

const PENDING_MS = 12_000
const pendingByObject = new Map<string, { detail: LinkFeedbackDetail; expires: number }>()

export function pendingLinkFeedback(objectId: string): LinkFeedbackDetail | null {
  const row = pendingByObject.get(objectId)
  if (!row) return null
  if (row.expires < Date.now()) {
    pendingByObject.delete(objectId)
    return null
  }
  return row.detail
}

export function publishLinkFeedback(detail: LinkFeedbackDetail) {
  if (typeof window === 'undefined') return
  pendingByObject.set(detail.sectionObjectId, { detail, expires: Date.now() + PENDING_MS })
  window.dispatchEvent(new CustomEvent<LinkFeedbackDetail>(LINK_FEEDBACK_EVENT, { detail }))
  for (const id of detail.tableObjectIds ?? []) flashObject(id)
}

/** Pick which endpoint owns the link list the user dropped onto. */
export function linkSectionObjectId(
  drop: { source: { id: string }; targets: Array<{ id: string }>; preferred?: { linkType: string; direction: 'out' | 'in' } },
  body: { from_id: string; to_id: string },
): string {
  if (drop.preferred) return drop.source.id
  const targetIds = new Set(drop.targets.map((item) => item.id))
  if (targetIds.has(body.from_id)) return body.from_id
  if (targetIds.has(body.to_id)) return body.to_id
  return drop.targets[0]?.id ?? drop.source.id
}