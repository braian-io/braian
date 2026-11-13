export type Point = { x: number; y: number }
export type EdgeLabelNode = Point & { radius: number }
export type EdgeLabelSize = { width: number; height: number }
export type EdgeLabelBox = Point & { width: number; height: number }

const DEFAULT_T = 0.68
const CANDIDATE_TS = [DEFAULT_T, 0.6, 0.52, 0.44, 0.36, 0.75]
const CANDIDATE_OFFSETS = [0, 1, -1, 2, -2, 3, -3]

/** Readable edge labels everywhere on a small graph, only on the active node elsewhere. */
export type EdgeLabelMode = 'all' | 'active' | 'none'

export function edgeLabelMode(edgeCount: number, _zoom: number, modelMode: boolean): EdgeLabelMode {
  // A sparse graph names every relation at rest even when the fitted camera is
  // zoomed out (a typical object graph lands at 0.44). A dense graph labels the
  // focused endpoint's edges, so selection and hover always win over zoom.
  if (modelMode) return 'all'
  return edgeCount <= 10 ? 'all' : 'active'
}

export function curvePoint(from: Point, control: Point, to: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  }
}

function curveTangent(from: Point, control: Point, to: Point, t: number): Point {
  return {
    x: 2 * (1 - t) * (control.x - from.x) + 2 * t * (to.x - control.x),
    y: 2 * (1 - t) * (control.y - from.y) + 2 * t * (to.y - control.y),
  }
}

function centeredBox(point: Point, size: EdgeLabelSize): EdgeLabelBox {
  return {
    x: point.x - size.width / 2,
    y: point.y - size.height / 2,
    width: size.width,
    height: size.height,
  }
}

function discOverlap(box: EdgeLabelBox, node: EdgeLabelNode): number {
  const closestX = Math.max(box.x, Math.min(node.x, box.x + box.width))
  const closestY = Math.max(box.y, Math.min(node.y, box.y + box.height))
  const dx = node.x - closestX
  const dy = node.y - closestY
  const distanceSq = dx * dx + dy * dy
  if (distanceSq >= node.radius * node.radius) return 0
  return node.radius - Math.sqrt(distanceSq)
}

function boxOverlap(a: EdgeLabelBox, b: EdgeLabelBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

function score(
  point: Point,
  size: EdgeLabelSize,
  nodes: EdgeLabelNode[],
  placed: EdgeLabelBox[],
  avoid: EdgeLabelBox[],
): number {
  const box = centeredBox(point, size)
  let total = 0
  for (const node of nodes) total += discOverlap(box, node) * 100
  for (const other of placed) total += boxOverlap(box, other)
  // Captions are as important as circles: a shown label must not sit on one.
  for (const rect of avoid) total += boxOverlap(box, rect) * 100
  return total
}

export function placeEdgeLabel(
  from: Point,
  control: Point,
  to: Point,
  size: EdgeLabelSize,
  nodes: EdgeLabelNode[],
  placed: EdgeLabelBox[] = [],
  avoid: EdgeLabelBox[] = [],
): Point {
  const maxRadius = nodes.reduce((max, node) => Math.max(max, node.radius), 0)
  const offsetStep = Math.max(size.height / 2 + 6, maxRadius + size.height / 2 + 4)
  let best = curvePoint(from, control, to, DEFAULT_T)
  let bestScore = score(best, size, nodes, placed, avoid)
  for (const t of CANDIDATE_TS) {
    const point = curvePoint(from, control, to, t)
    const tangent = curveTangent(from, control, to, t)
    const length = Math.hypot(tangent.x, tangent.y) || 1
    const normal = { x: -tangent.y / length, y: tangent.x / length }
    for (const offset of CANDIDATE_OFFSETS) {
      const candidate = {
        x: point.x + normal.x * offset * offsetStep,
        y: point.y + normal.y * offset * offsetStep,
      }
      const candidateScore = score(candidate, size, nodes, placed, avoid)
      if (candidateScore < bestScore) {
        best = candidate
        bestScore = candidateScore
      }
    }
  }
  return best
}
