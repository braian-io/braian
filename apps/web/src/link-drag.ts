import { copy } from './i18n'
import type { LinkDirection } from './link-choices'
import type { LinkEndpoint } from './link-create-dialog'

export const linkDragMime = 'application/x-braian-objects'

export type LinkDropDetail = {
  source: LinkEndpoint
  targets: LinkEndpoint[]
  preferred?: { linkType: string; direction: LinkDirection }
}

let dragging = new Set<string>()
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

export function readLinkDrag(raw: string): LinkEndpoint[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { objects?: LinkEndpoint[] }
    return (parsed.objects ?? []).filter((item) => item && item.id && item.typeKey)
  } catch {
    return []
  }
}

export function beginLinkDrag(event: DragEvent, objects: LinkEndpoint[]) {
  if (objects.length === 0 || !event.dataTransfer) return
  dragging = new Set(objects.map((item) => item.id))
  event.dataTransfer.setData(linkDragMime, JSON.stringify({ objects }))
  event.dataTransfer.effectAllowed = 'copy'
  const blank = document.createElement('canvas')
  blank.width = 1
  blank.height = 1
  event.dataTransfer.setDragImage(blank, 0, 0)
  placeGhost(objects, event.clientX, event.clientY)
  const move = (next: DragEvent) => {
    if (next.clientX === 0 && next.clientY === 0) return
    placeGhost(objects, next.clientX, next.clientY)
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
  ghost?.remove()
  ghost = null
}

export function dispatchLinkDrop(detail: LinkDropDetail) {
  window.dispatchEvent(new CustomEvent<LinkDropDetail>('braian-link-drop', { detail }))
}

function placeGhost(objects: LinkEndpoint[], x: number, y: number) {
  if (!ghost) {
    ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.dataset.testid = 'link-drag-ghost'
    document.body.appendChild(ghost)
  }
  const first = objects[0]
  const label = first?.name || first?.key || first?.id || ''
  ghost.textContent = objects.length > 1
    ? copy.linkDragCount.replace('{count}', String(objects.length))
    : label
  ghost.style.left = `${x + 12}px`
  ghost.style.top = `${y + 12}px`
}
