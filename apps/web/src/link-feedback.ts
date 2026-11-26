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

const PENDING_MS = 30_000
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

/** Object whose detail link list should show row highlight and section hint. */
export function linkSectionObjectId(
  drop: { source: { id: string }; targets: Array<{ id: string }>; preferred?: { linkType: string; direction: 'out' | 'in' } },
  _body: { from_id: string; to_id: string },
): string {
  // Row drop and Detail-section drop both set `source` to the anchor object the user dropped onto.
  return drop.source.id
}