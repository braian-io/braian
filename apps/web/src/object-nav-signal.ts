/**
 * Arrow-driven object changes should replace URL history instead of pushing.
 * The mark is the object id the arrow landed on. A later click, a return to
 * the row the burst started on, or a failed load must not reuse it.
 */
let replaceObjectId: string | null = null

export function markObjectNavReplace(objectId: string) {
  replaceObjectId = objectId
}

export function clearObjectNavReplace(objectId?: string) {
  if (objectId == null || replaceObjectId === objectId) replaceObjectId = null
}

export function objectNavReplaceId(): string | null {
  return replaceObjectId
}

/** True only when this URL write is for the marked object. Any object write consumes the mark. */
export function takeObjectNavReplace(objectId: string | null | undefined): boolean {
  const replace = Boolean(objectId) && replaceObjectId === objectId
  if (objectId) replaceObjectId = null
  return replace
}

export function resetObjectNavReplace() {
  replaceObjectId = null
}

export const OBJECT_LAND_IMMEDIATE = 'braian-object-land-immediate' as const

export function notifyObjectLandImmediate(id: string) {
  window.dispatchEvent(new CustomEvent(OBJECT_LAND_IMMEDIATE, { detail: { id } }))
}
