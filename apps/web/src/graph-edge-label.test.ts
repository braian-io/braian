import { describe, expect, it } from 'vitest'
import { curvePoint, edgeLabelMode, placeEdgeLabel, type EdgeLabelBox, type EdgeLabelNode } from './graph-edge-label'
import { visibleCaptionIds, type LabelBox } from './graph-scene'

const from = { x: 0, y: 0 }
const control = { x: 100, y: 0 }
const to = { x: 200, y: 0 }
const size = { width: 80, height: 16 }

function labelBox(point: { x: number; y: number }): EdgeLabelBox {
  return { x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height }
}

function distanceToBox(node: EdgeLabelNode, box: EdgeLabelBox) {
  const closestX = Math.max(box.x, Math.min(node.x, box.x + box.width))
  const closestY = Math.max(box.y, Math.min(node.y, box.y + box.height))
  return Math.hypot(node.x - closestX, node.y - closestY)
}

function overlaps(box: EdgeLabelBox, other: EdgeLabelBox) {
  return (
    box.x < other.x + other.width &&
    box.x + box.width > other.x &&
    box.y < other.y + other.height &&
    box.y + box.height > other.y
  )
}

function captionBox(id: string, priority: number, box: EdgeLabelBox): LabelBox {
  return { id, priority, left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }
}

describe('edge label density', () => {
  it('shows every label on a small graph at rest, even at the fitted default zoom', () => {
    expect(edgeLabelMode(7, 0.9, false)).toBe('all')
    expect(edgeLabelMode(10, 0.9, false)).toBe('all')
    expect(edgeLabelMode(4, 0.44, false)).toBe('all')
    expect(edgeLabelMode(10, 0.25, false)).toBe('all')
  })

  it('keeps only the active node labels on a dense graph, independent of zoom', () => {
    expect(edgeLabelMode(11, 0.9, false)).toBe('active')
    expect(edgeLabelMode(80, 1.4, false)).toBe('active')
    // The fitted camera on a typical object graph lands at 0.44; selection and
    // hover still label their edges there.
    expect(edgeLabelMode(51, 0.44, false)).toBe('active')
    expect(edgeLabelMode(51, 0.35, false)).toBe('active')
  })

  it('keeps the model graph labels at every zoom', () => {
    expect(edgeLabelMode(4, 0.4, true)).toBe('all')
    expect(edgeLabelMode(40, 0.54, true)).toBe('all')
    expect(edgeLabelMode(400, 0.25, true)).toBe('all')
  })
})

describe('edge label placement', () => {
  it('keeps the default mid when no nodes are visible', () => {
    const point = placeEdgeLabel(from, control, to, size, [])
    expect(point).toEqual(curvePoint(from, control, to, 0.68))
    expect(Number.isFinite(point.x)).toBe(true)
    expect(Number.isFinite(point.y)).toBe(true)
  })

  it('keeps the default mid when the nearest node is clear of it', () => {
    const nodes = [{ x: 500, y: 500, radius: 24 }]
    const point = placeEdgeLabel(from, control, to, size, nodes)
    expect(point).toEqual(curvePoint(from, control, to, 0.68))
  })

  it('moves away from a node covering the default mid', () => {
    const defaultPoint = curvePoint(from, control, to, 0.68)
    const nodes = [{ x: defaultPoint.x, y: defaultPoint.y, radius: 30 }]
    const point = placeEdgeLabel(from, control, to, size, nodes)
    expect(point).not.toEqual(defaultPoint)
    expect(distanceToBox(nodes[0]!, labelBox(point))).toBeGreaterThanOrEqual(30)
  })

  it('moves away from a node caption covering the default mid', () => {
    const defaultPoint = curvePoint(from, control, to, 0.68)
    const caption = { x: defaultPoint.x - 40, y: defaultPoint.y - 8, width: 80, height: 16 }
    const point = placeEdgeLabel(from, control, to, size, [], [], [caption])
    const box = labelBox(point)
    const overlaps =
      box.x < caption.x + caption.width &&
      box.x + box.width > caption.x &&
      box.y < caption.y + caption.height &&
      box.y + box.height > caption.y
    expect(point).not.toEqual(defaultPoint)
    expect(overlaps).toBe(false)
  })

  it('places an active label beside a named caption and keeps the name visible', () => {
    const mid = curvePoint(from, control, to, 0.68)
    const caption = { id: 'article', priority: 5, x: mid.x - 50, y: mid.y - 8, width: 100, height: 16 }
    const point = placeEdgeLabel(from, control, to, size, [], [], [caption])
    const box = labelBox(point)
    expect(overlaps(box, caption), 'the label moves off the named caption').toBe(false)
    const shown = visibleCaptionIds([captionBox(caption.id, caption.priority, caption)], 1, {
      paneWidth: 400,
      edgeLabels: [{ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }],
    })
    expect(shown.has('article'), 'the name stays painted').toBe(true)
  })

  it('still paints an active label when every slot covers a name; the caption hides (K5)', () => {
    const everything = { id: 'article', priority: 5, x: -50, y: -100, width: 300, height: 200 }
    const point = placeEdgeLabel(from, control, to, size, [], [], [everything])
    expect(Number.isFinite(point.x) && Number.isFinite(point.y), 'the label is still painted').toBe(true)
    const box = labelBox(point)
    const shown = visibleCaptionIds([captionBox(everything.id, everything.priority, everything)], 1, {
      paneWidth: 400,
      edgeLabels: [{ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }],
    })
    expect(shown.has('article'), 'the covered caption hides instead of dropping the label').toBe(false)
  })
})
