import type { Json } from './api'
import { copy } from './i18n'
import { linkCountNoun, linkDragDenial, type LinkDirection } from './link-choices'
import type { LinkEndpoint } from './link-create-dialog'

export const linkDragMime = 'application/x-braian-objects'

export type LinkDropDetail = {
  source: LinkEndpoint
  targets: LinkEndpoint[]
  preferred?: { linkType: string; direction: LinkDirection }
}

let dragging = new Set<string>()
let payload: LinkEndpoint[] = []
let label = ''
let hint: string | null = null
let ghost: HTMLDivElement | null = null

/** Drag every selected row when the gesture starts on one of them. */
export function linkDragObjects(dragged: LinkEndpoint, selectedIds: string[], known: LinkEndpoint[]): LinkEndpoint[] {
  const ids = selectedIds.includes(dragged.id) ? selectedIds : [dragged.id]
  const byId = new Map(known.map((item) => [item.id, item]))
  byId.set(dragged.id, dragged)
  const objects: LinkEndpoint[] = []
  for (const id of ids) {
    const item = byId.get(id)
    if (item) objects.push(item)
  }
  return objects.length > 0 ? objects : [dragged]
}

/** Detail section direction is already from the open object, which is the drop anchor. */
export function linkDropFromSection(input: {
  object: LinkEndpoint
  dragged: LinkEndpoint[]
  linkType: string
  direction: LinkDirection
}): LinkDropDetail | null {
  const targets = input.dragged.filter((item) => item.id !== input.object.id)
  if (targets.length === 0) return null
  return {
    source: input.object,
    targets,
    preferred: { linkType: input.linkType, direction: input.direction },
  }
}

export function linkDragActive(types: ArrayLike<string>) {
  return Array.from(types).includes(linkDragMime)
}

export function linkDragContains(id: string) {
  return dragging.has(id)
}

export function linkDragPayload(): LinkEndpoint[] {
  return payload
}

export type LinkDropDecision =
  | { accept: true; hint: null }
  | { accept: false; reason: 'loading' | 'denied'; hint: string }

/** While definitions are still loading, nothing is a valid drop. */
export function linkDropDecision(input: {
  loading: boolean
  defs?: Json
  anchorType: string
  draggedTypes: string[]
}): LinkDropDecision {
  if (input.loading && !input.defs) {
    return { accept: false, reason: 'loading', hint: copy.linkTypesLoading }
  }
  const deny = linkDragDenial(input.defs, input.anchorType, input.draggedTypes)
  if (deny) return { accept: false, reason: 'denied', hint: deny }
  return { accept: true, hint: null }
}

/** `Link Coast & Meadow`, or `Link 3 articles` when several rows share a type. */
export function linkDragLabel(objects: LinkEndpoint[], defs?: Json) {
  const first = objects[0]
  if (!first || objects.length <= 1) {
    return copy.linkDragVerb.replace('{label}', first?.name || first?.key || first?.id || '')
  }
  const shared = objects.every((item) => item.typeKey === first.typeKey) ? first.typeKey : ''
  return copy.linkDragVerb.replace('{label}', linkCountNoun(objects.length, defs, shared))
}

/** Replaces the name while the pointer is over a target that cannot accept the drag. */
export function setLinkDragHint(text: string | null) {
  hint = text
  if (ghost) ghost.textContent = text || label
}

export function readLinkDrag(raw: string): LinkEndpoint[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { objects?: LinkEndpoint[] }
    return (parsed.objects ?? []).filter((item) => item && item.id && item.typeKey)
  } catch {
    return []
  }
}

export function beginLinkDrag(event: DragEvent, objects: LinkEndpoint[], dragLabel: string) {
  if (objects.length === 0 || !event.dataTransfer) return
  dragging = new Set(objects.map((item) => item.id))
  payload = objects
  label = dragLabel
  hint = null
  event.dataTransfer.setData(linkDragMime, JSON.stringify({ objects }))
  event.dataTransfer.effectAllowed = 'copy'
  const blank = document.createElement('canvas')
  blank.width = 1
  blank.height = 1
  event.dataTransfer.setDragImage(blank, 0, 0)
  placeGhost(event.clientX, event.clientY)
  const move = (next: DragEvent) => {
    if (next.clientX === 0 && next.clientY === 0) return
    placeGhost(next.clientX, next.clientY)
  }
  const end = () => {
    window.removeEventListener('dragenter', move, true)
    window.removeEventListener('dragover', move)
    window.removeEventListener('dragend', end)
    window.removeEventListener('drop', end)
    endLinkDrag()
  }
  window.addEventListener('dragenter', move, true)
  window.addEventListener('dragover', move)
  window.addEventListener('dragend', end)
  window.addEventListener('drop', end)
}

export function endLinkDrag() {
  dragging = new Set()
  payload = []
  label = ''
  hint = null
  ghost?.remove()
  ghost = null
  window.dispatchEvent(new CustomEvent('braian-link-dragend'))
}

export function dispatchLinkDrop(detail: LinkDropDetail) {
  window.dispatchEvent(new CustomEvent<LinkDropDetail>('braian-link-drop', { detail }))
}

function placeGhost(x: number, y: number) {
  if (!ghost) {
    ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.dataset.testid = 'link-drag-ghost'
    document.body.appendChild(ghost)
  }
  ghost.textContent = hint || label
  const spot = ghostSpot(x, y, ghost.offsetWidth || 180, ghost.offsetHeight || 28)
  ghost.style.left = `${spot.left}px`
  ghost.style.top = `${spot.top}px`
}

/** Below-right of the pointer, outside the row under it so the preview does not cover a drop target. */
function ghostSpot(x: number, y: number, width: number, height: number) {
  const anchor = document.elementFromPoint(x, y)?.closest('[data-testid="object-row"], [data-testid="link-section"]')
  const box = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null
  const margin = 8
  if (box && anchor?.getAttribute('data-testid') === 'object-row') {
    const beside = box.right + margin
    if (beside + width <= window.innerWidth - margin) {
      return { left: beside, top: Math.max(margin, box.top) }
    }
    return {
      left: Math.max(margin, Math.min(box.right - width - margin, window.innerWidth - width - margin)),
      top: Math.min(window.innerHeight - height - margin, box.bottom + margin),
    }
  }
  if (box) {
    let left = box.left + margin
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width
    return {
      left: Math.max(margin, left),
      top: Math.min(window.innerHeight - height - margin, box.bottom + margin),
    }
  }
  return {
    left: Math.max(margin, Math.min(x + 24, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(y + 44, window.innerHeight - height - margin)),
  }
}
