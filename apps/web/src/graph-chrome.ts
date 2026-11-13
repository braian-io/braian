/** Pane chrome for the graph. Width is the graph pane, not the viewport. */

export const GRAPH_WIDE_MIN_PX = 720
export const GRAPH_SHEET_MAX_RATIO = 0.35
export const GRAPH_CHIP_MAX_PX = 40
export const SHEET_SWIPE_PX = 28
const EDGE_PX = 12

export type GraphDensity = 'wide' | 'narrow'
export type SheetMode = 'compact' | 'expanded' | 'chip' | 'dismissed'
export type DetailPlacement = 'side' | 'sheet' | 'chip' | 'hidden'
export type LegendLayout = 'labeled' | 'compact'

export type Box = { x: number; y: number; width: number; height: number }
export type GraphFrame = { x: number; y: number; width: number; height: number }
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export type NodeLabelPlacement = {
  orientation: 'below' | 'above'
  captionY: number
  subtitleY: number
  top: number
  bottom: number
}

const CAPTION_HALF = 8
const SUBTITLE_GAP = 14
const SUBTITLE_HALF = 5

/**
 * Keep a caption (and the active node's subtitle) inside the pane. A caption
 * that would run past the bottom edge flips above the circle instead of
 * clipping; both orientations clamp to a small margin.
 */
export function placeNodeLabel(
  pointY: number,
  radius: number,
  stageHeight: number,
  hasSubtitle = false,
  margin = 4,
): NodeLabelPlacement {
  const height = Number.isFinite(stageHeight) ? Math.max(0, stageHeight) : 0
  const belowCaption = pointY + radius + 12
  const belowBottom = belowCaption + CAPTION_HALF + (hasSubtitle ? SUBTITLE_GAP + SUBTITLE_HALF : 0)
  const aboveCaption = pointY - radius - 12 - (hasSubtitle ? SUBTITLE_GAP : 0)
  const aboveTop = aboveCaption - CAPTION_HALF
  const orientation: 'below' | 'above' = belowBottom <= height - margin || aboveTop < margin ? 'below' : 'above'
  const caption = orientation === 'below' ? belowCaption : aboveCaption
  const minCaption = margin + CAPTION_HALF + (orientation === 'above' && hasSubtitle ? SUBTITLE_GAP : 0)
  const maxCaption = height - margin - CAPTION_HALF - (orientation === 'below' && hasSubtitle ? SUBTITLE_GAP : 0)
  const captionY = maxCaption <= minCaption ? height / 2 : Math.min(Math.max(caption, minCaption), maxCaption)
  const subtitleY = orientation === 'below' ? captionY + SUBTITLE_GAP : captionY - SUBTITLE_GAP
  const top = Math.min(captionY - CAPTION_HALF, hasSubtitle ? subtitleY - SUBTITLE_HALF : captionY - CAPTION_HALF)
  const bottom = Math.max(captionY + CAPTION_HALF, hasSubtitle ? subtitleY + SUBTITLE_HALF : captionY + CAPTION_HALF)
  return { orientation, captionY, subtitleY, top, bottom }
}

export function graphDensity(width: number): GraphDensity {
  if (!Number.isFinite(width) || width < GRAPH_WIDE_MIN_PX) return 'narrow'
  return 'wide'
}

export function sheetMaxHeight(stageHeight: number): number {
  if (!Number.isFinite(stageHeight) || stageHeight <= 0) return 0
  return stageHeight * GRAPH_SHEET_MAX_RATIO
}

export function legendLayout(density: GraphDensity): LegendLayout {
  return density === 'narrow' ? 'compact' : 'labeled'
}

/** Wide: side card. Narrow: bottom sheet, chip, or nothing when dismissed / empty. */
export function detailPlacement(density: GraphDensity, sheet: SheetMode, hasNode: boolean): DetailPlacement {
  if (density === 'wide') return 'side'
  if (!hasNode || sheet === 'dismissed') return 'hidden'
  if (sheet === 'chip') return 'chip'
  return 'sheet'
}

export function propertiesOpen(density: GraphDensity, sheet: SheetMode): boolean {
  if (density === 'wide') return true
  return sheet === 'expanded'
}

export type InspectorChrome = {
  anchor: 'right' | 'bottom' | 'corner' | 'none'
  /** Content height, capped by maxHeightPx. Never stretch to the stage. */
  height: 'content' | 'capped'
  maxHeightPx: number
}

export function inspectorChrome(placement: DetailPlacement, stageHeight: number): InspectorChrome {
  const height = Number.isFinite(stageHeight) ? Math.max(0, stageHeight) : 0
  if (placement === 'hidden') return { anchor: 'none', height: 'content', maxHeightPx: 0 }
  if (placement === 'chip') return { anchor: 'corner', height: 'content', maxHeightPx: GRAPH_CHIP_MAX_PX }
  if (placement === 'sheet') return { anchor: 'bottom', height: 'capped', maxHeightPx: sheetMaxHeight(height) }
  return { anchor: 'right', height: 'content', maxHeightPx: Math.max(0, height - 16) }
}

/**
 * Swipe up reveals more. Swipe down collapses toward a chip.
 * A small movement is a click: compact toggles properties, a chip opens the card.
 */
export function sheetAfterGesture(sheet: SheetMode, deltaY: number): SheetMode {
  if (sheet === 'dismissed') return sheet
  if (deltaY <= -SHEET_SWIPE_PX) {
    if (sheet === 'chip') return 'compact'
    return 'expanded'
  }
  if (deltaY >= SHEET_SWIPE_PX) {
    if (sheet === 'expanded') return 'compact'
    return 'chip'
  }
  if (sheet === 'expanded') return 'compact'
  if (sheet === 'chip') return 'compact'
  return 'expanded'
}

export function nodeSummary(
  node: { caption: string; subtitle: string; kindLabel: string; properties: Array<{ label: string; value: string }> },
  labels: { type: string; number: string },
): { name: string; type: string; detail: string } {
  const typed = node.properties.find((item) => item.label === labels.type)?.value
  const number = node.properties.find((item) => item.label === labels.number)?.value ?? ''
  const type = typed || node.kindLabel
  const subtitle = node.subtitle.trim()
  const detail = number || (subtitle && subtitle !== type && subtitle !== node.caption ? subtitle : '')
  return { name: node.caption, type, detail }
}

/** Pull a narrow bottom sheet down to the 35% cap. Short chips and top legends stay put. */
export function clampSheetBoxes(stage: { width: number; height: number }, boxes: Box[], density: GraphDensity): Box[] {
  if (density !== 'narrow') return boxes
  const maxH = sheetMaxHeight(stage.height)
  if (maxH <= 0) return boxes
  return boxes.map((box) => {
    if (box.width <= 0 || box.height <= 0) return box
    const gapBottom = stage.height - (box.y + box.height)
    if (gapBottom > EDGE_PX || box.height <= maxH + 0.5) return box
    const height = maxH
    return { ...box, y: stage.height - Math.max(0, gapBottom) - height, height }
  })
}

/**
 * Free rectangle after edge-anchored chrome.
 * A corner box insets the edge it costs less area to give up,
 * so a side card shrinks width and a bottom sheet shrinks height.
 */
export function visibleGraphFrame(stage: { width: number; height: number }, chrome: Box[]): GraphFrame {
  let left = 0
  let top = 0
  let right = Math.max(0, stage.width)
  let bottom = Math.max(0, stage.height)
  for (const box of chrome) {
    if (box.width <= 0 || box.height <= 0) continue
    if (box.x + box.width <= 0 || box.y + box.height <= 0) continue
    if (box.x >= stage.width || box.y >= stage.height) continue
    const edge = anchorEdge(box, stage)
    if (edge === 'right') right = Math.min(right, box.x)
    else if (edge === 'left') left = Math.max(left, box.x + box.width)
    else if (edge === 'bottom') bottom = Math.min(bottom, box.y)
    else top = Math.max(top, box.y + box.height)
  }
  if (right < left) right = left
  if (bottom < top) bottom = top
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

export function readGraphFrame(
  stage: { width: number; height: number },
  boxes: Box[],
  density: GraphDensity,
): GraphFrame {
  return visibleGraphFrame(stage, clampSheetBoxes(stage, boxes, density))
}

function anchorEdge(box: Box, stage: { width: number; height: number }): 'left' | 'right' | 'top' | 'bottom' {
  const gap = {
    left: Math.max(0, box.x),
    right: Math.max(0, stage.width - (box.x + box.width)),
    top: Math.max(0, box.y),
    bottom: Math.max(0, stage.height - (box.y + box.height)),
  }
  const area = {
    left: (box.x + box.width) * stage.height,
    right: (stage.width - box.x) * stage.height,
    top: (box.y + box.height) * stage.width,
    bottom: (stage.height - box.y) * stage.width,
  }
  const edges = ['left', 'right', 'top', 'bottom'] as const
  const touching = edges.filter((edge) => gap[edge] <= EDGE_PX)
  const pool = [...(touching.length > 0 ? touching : edges)]
  pool.sort((left, right) => area[left] - area[right] || gap[left] - gap[right])
  return pool[0] ?? 'bottom'
}

/** Place the camera so the bounds sit in the free frame, not under the chrome. */
export function fitCamera(input: {
  frame: GraphFrame
  bounds: Bounds
  pad?: number
  minScale?: number
  maxScale?: number
}): { k: number; x: number; y: number } {
  const pad = input.pad ?? 16
  const viewW = Math.max(1, input.frame.width - pad * 2)
  const viewH = Math.max(1, input.frame.height - pad * 2)
  const boundsW = Math.max(1, input.bounds.maxX - input.bounds.minX)
  const boundsH = Math.max(1, input.bounds.maxY - input.bounds.minY)
  const fitted = Math.min(viewW / boundsW, viewH / boundsH)
  const k = Math.min(input.maxScale ?? 1.25, Math.max(input.minScale ?? 0.35, fitted))
  const cx = (input.bounds.minX + input.bounds.maxX) / 2
  const cy = (input.bounds.minY + input.bounds.maxY) / 2
  return {
    k,
    x: input.frame.x + pad + viewW / 2 - cx * k,
    y: input.frame.y + pad + viewH / 2 - cy * k,
  }
}

export type CaptionExtent = {
  /** Node centre in world coordinates. */
  x: number
  y: number
  /** Node circle radius in world coordinates. */
  radius: number
  /** Measured caption width in screen pixels (the caption does not scale with k). */
  captionWidth: number
}

const CAPTION_SIDE_PAD_PX = 4
const CAPTION_VERTICAL_PAD_PX = 20

/**
 * Fit the camera around the circles and their measured captions. Captions are
 * drawn at a fixed screen size, so their world extent is `width / k`; iterate a
 * few times because k itself is what we are solving for. A long caption on the
 * left or right edge widens the bounds instead of being clipped by the old
 * `length * 3.6` estimate.
 */
export function fitCameraWithLabels(input: {
  frame: GraphFrame
  nodes: CaptionExtent[]
  pad?: number
  minScale?: number
  maxScale?: number
}): { k: number; x: number; y: number } | undefined {
  if (input.nodes.length === 0) return undefined
  const pad = input.pad ?? 16
  const circles = circleBounds(input.nodes)
  let bounds = circles
  let camera = fitCamera({ frame: input.frame, bounds, pad, minScale: input.minScale, maxScale: input.maxScale })
  for (let pass = 0; pass < 6; pass += 1) {
    const k = Math.max(1e-6, camera.k)
    const next = { ...circles }
    for (const node of input.nodes) {
      if (node.captionWidth > 0) {
        const half = (node.captionWidth / 2 + CAPTION_SIDE_PAD_PX) / k
        next.minX = Math.min(next.minX, node.x - half)
        next.maxX = Math.max(next.maxX, node.x + half)
      }
      const vertical = CAPTION_VERTICAL_PAD_PX / k
      next.minY = Math.min(next.minY, node.y - node.radius - vertical)
      next.maxY = Math.max(next.maxY, node.y + node.radius + vertical)
    }
    const nextCamera = fitCamera({
      frame: input.frame,
      bounds: next,
      pad,
      minScale: input.minScale,
      maxScale: input.maxScale,
    })
    bounds = next
    const settled = Math.abs(nextCamera.k - camera.k) < 0.001
    camera = nextCamera
    if (settled) break
  }
  return camera
}

function circleBounds(nodes: CaptionExtent[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.radius)
    maxX = Math.max(maxX, node.x + node.radius)
    minY = Math.min(minY, node.y - node.radius)
    maxY = Math.max(maxY, node.y + node.radius)
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Keep the user's zoom and the world point at the old frame centre, then put
 * that point at the new frame centre. Used when a resize or a full-size toggle
 * changes the viewport while the camera belongs to the user.
 */
export function remapCamera(input: {
  camera: { k: number; x: number; y: number }
  from: GraphFrame
  to: GraphFrame
}): { k: number; x: number; y: number } {
  const k = input.camera.k
  const fromX = input.from.x + input.from.width / 2
  const fromY = input.from.y + input.from.height / 2
  const toX = input.to.x + input.to.width / 2
  const toY = input.to.y + input.to.height / 2
  const worldX = (fromX - input.camera.x) / k
  const worldY = (fromY - input.camera.y) / k
  return { k, x: toX - worldX * k, y: toY - worldY * k }
}
