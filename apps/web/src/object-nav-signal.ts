/** Arrow-driven object changes should replace URL history instead of pushing. */
let replaceNextObjectUrl = false

export function markObjectNavReplace() {
  replaceNextObjectUrl = true
}

export function takeObjectNavReplace(): boolean {
  const replace = replaceNextObjectUrl
  replaceNextObjectUrl = false
  return replace
}

export const OBJECT_LAND_IMMEDIATE = 'braian-object-land-immediate' as const

export function notifyObjectLandImmediate(id: string) {
  window.dispatchEvent(new CustomEvent(OBJECT_LAND_IMMEDIATE, { detail: { id } }))
}