import { describe, expect, it } from 'vitest'
import { curvePoint, placeEdgeLabel, type EdgeLabelBox, type EdgeLabelNode } from './graph-edge-label'

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
})
