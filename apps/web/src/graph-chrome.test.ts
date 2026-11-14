import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  GRAPH_SHEET_MAX_RATIO,
  GRAPH_WIDE_MIN_PX,
  SHEET_SWIPE_PX,
  chromeMeasureReady,
  clampSheetBoxes,
  detailPlacement,
  fitCamera,
  fitCameraWithLabels,
  graphDensity,
  inspectorChrome,
  legendLayout,
  nodeSummary,
  placeNodeLabel,
  propertiesOpen,
  readGraphFrame,
  remapCamera,
  sheetAfterGesture,
  sheetMaxHeight,
  visibleGraphFrame,
} from './graph-chrome'
import { visibleCaptionIds } from './graph-scene'

const bounds = { minX: -100, minY: -80, maxX: 100, maxY: 80 }

describe('graph pane breakpoint', () => {
  it('treats panes under 720px as narrow and the rest as wide', () => {
    expect(GRAPH_WIDE_MIN_PX).toBe(720)
    expect(graphDensity(0)).toBe('narrow')
    expect(graphDensity(370)).toBe('narrow')
    expect(graphDensity(719)).toBe('narrow')
    expect(graphDensity(719.9)).toBe('narrow')
    expect(graphDensity(720)).toBe('wide')
    expect(graphDensity(1200)).toBe('wide')
    expect(graphDensity(Number.NaN)).toBe('narrow')
  })

  it('keeps the container query on the same breakpoint and sheet cap', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
    expect(css).toContain('container-name: graph')
    expect(css).toContain('container-type: inline-size')
    expect(css).toContain('width < 720px')
    expect(css).toContain('max-height: 35%')
    expect(css).toContain('flex-wrap: nowrap')
    expect(css).toMatch(/\.graph-inspector \{[^}]*height: auto/)
    expect(css).not.toMatch(/\.graph-inspector \{[^}]*bottom: 8px/)
    expect(GRAPH_SHEET_MAX_RATIO).toBe(0.35)
  })

  it('sizes the wide side card to content and caps a narrow sheet at 35%', () => {
    expect(detailPlacement('wide', 'compact', true)).toBe('side')
    expect(detailPlacement('wide', 'dismissed', true)).toBe('side')
    expect(detailPlacement('wide', 'chip', false)).toBe('side')
    const side = inspectorChrome('side', 640)
    expect(side).toEqual({ anchor: 'right', height: 'content', maxHeightPx: 624 })
    expect(side.maxHeightPx).toBeLessThan(640)

    expect(detailPlacement('narrow', 'compact', true)).toBe('sheet')
    expect(detailPlacement('narrow', 'expanded', true)).toBe('sheet')
    expect(detailPlacement('narrow', 'chip', true)).toBe('chip')
    expect(detailPlacement('narrow', 'dismissed', true)).toBe('hidden')
    expect(detailPlacement('narrow', 'compact', false)).toBe('hidden')

    const stage = 500
    const sheet = inspectorChrome('sheet', stage)
    expect(sheet.height).toBe('capped')
    expect(sheet.maxHeightPx).toBeCloseTo(sheetMaxHeight(stage))
    expect(sheet.maxHeightPx / stage).toBeLessThanOrEqual(0.35)
    expect(inspectorChrome('chip', stage).maxHeightPx).toBe(40)
    expect(inspectorChrome('hidden', stage).anchor).toBe('none')
  })

  it('collapses the legend to one compact row in a narrow pane', () => {
    expect(legendLayout('wide')).toBe('labeled')
    expect(legendLayout('narrow')).toBe('compact')
  })

  it('shows properties on the side card and only after expand on the sheet', () => {
    expect(propertiesOpen('wide', 'compact')).toBe(true)
    expect(propertiesOpen('narrow', 'compact')).toBe(false)
    expect(propertiesOpen('narrow', 'expanded')).toBe(true)
    expect(propertiesOpen('narrow', 'chip')).toBe(false)
  })
})

describe('graph sheet gestures', () => {
  it('expands on swipe up or click and collapses toward a chip on swipe down', () => {
    expect(sheetAfterGesture('compact', 0)).toBe('expanded')
    expect(sheetAfterGesture('compact', -(SHEET_SWIPE_PX - 1))).toBe('expanded')
    expect(sheetAfterGesture('compact', -SHEET_SWIPE_PX)).toBe('expanded')
    expect(sheetAfterGesture('compact', SHEET_SWIPE_PX)).toBe('chip')
    expect(sheetAfterGesture('expanded', SHEET_SWIPE_PX)).toBe('compact')
    expect(sheetAfterGesture('expanded', 0)).toBe('compact')
    expect(sheetAfterGesture('chip', 0)).toBe('compact')
    expect(sheetAfterGesture('chip', -SHEET_SWIPE_PX)).toBe('compact')
    expect(sheetAfterGesture('dismissed', -40)).toBe('dismissed')
    expect(sheetAfterGesture('dismissed', 0)).toBe('dismissed')
  })
})

describe('graph detail summary', () => {
  it('shows name, type, and number for an object', () => {
    expect(
      nodeSummary(
        {
          caption: '2-person tent',
          subtitle: 'Article',
          kindLabel: 'Object',
          properties: [
            { label: 'Type', value: 'Article' },
            { label: 'Number', value: 'ART-TENT-2' },
          ],
        },
        { type: 'Type', number: 'Number' },
      ),
    ).toEqual({ name: '2-person tent', type: 'Article', detail: 'ART-TENT-2' })
  })

  it('uses the value text when a node has no number', () => {
    expect(
      nodeSummary(
        {
          caption: 'Colour',
          subtitle: 'Green',
          kindLabel: 'Value',
          properties: [{ label: 'Value', value: 'Green' }],
        },
        { type: 'Type', number: 'Number' },
      ),
    ).toEqual({ name: 'Colour', type: 'Value', detail: 'Green' })
  })
})

describe('visible graph frame', () => {
  it('insets a short side card from the right and the legend from the bottom', () => {
    const stage = { width: 1000, height: 600 }
    const frame = visibleGraphFrame(stage, [
      { x: 752, y: 8, width: 240, height: 160 },
      { x: 8, y: 552, width: 480, height: 40 },
    ])
    expect(frame).toEqual({ x: 0, y: 0, width: 752, height: 552 })
  })

  it('insets a narrow pane for a top legend and a bottom sheet', () => {
    const stage = { width: 370, height: 640 }
    const frame = visibleGraphFrame(stage, [
      { x: 8, y: 8, width: 180, height: 32 },
      { x: 82, y: 460, width: 280, height: 172 },
    ])
    expect(frame.y).toBe(40)
    expect(frame.height).toBe(420)
    expect(frame.width).toBe(370)
    const covered = stage.height - (frame.y + frame.height)
    expect(covered).toBeLessThanOrEqual(stage.height * GRAPH_SHEET_MAX_RATIO + 12)
  })

  it('clamps a tall narrow sheet to 35% before fitting', () => {
    const stage = { width: 370, height: 600 }
    const boxes = clampSheetBoxes(
      stage,
      [
        { x: 8, y: 8, width: 180, height: 32 },
        { x: 82, y: 88, width: 280, height: 504 },
      ],
      'narrow',
    )
    const sheet = boxes[1]
    expect(sheet?.height).toBeCloseTo(210)
    expect(sheet!.height / stage.height).toBeLessThanOrEqual(0.35)
    const frame = readGraphFrame(stage, boxes, 'narrow')
    const covered = stage.height - (frame.y + frame.height)
    expect(covered).toBeLessThanOrEqual(stage.height * 0.35 + EDGE_SLACK)
  })

  it('leaves most of the pane free when details are a chip or dismissed', () => {
    const stage = { width: 370, height: 500 }
    const chip = visibleGraphFrame(stage, [
      { x: 8, y: 8, width: 160, height: 28 },
      { x: 220, y: 464, width: 140, height: 28 },
    ])
    expect(chip.height).toBeGreaterThan(stage.height * 0.8)
    const dismissed = visibleGraphFrame(stage, [{ x: 8, y: 8, width: 160, height: 28 }])
    expect(dismissed.height).toBeGreaterThan(chip.height)
  })

  it('does not clamp the wide side card', () => {
    const stage = { width: 960, height: 600 }
    const card = { x: 712, y: 8, width: 240, height: 400 }
    expect(clampSheetBoxes(stage, [card], 'wide')[0]).toEqual(card)
  })

  it('moves Fit into the free area when the sheet covers the bottom', () => {
    const stage = { width: 370, height: 640 }
    const open = readGraphFrame(stage, [{ x: 8, y: 8, width: 180, height: 32 }], 'narrow')
    const covered = readGraphFrame(
      stage,
      [
        { x: 8, y: 8, width: 180, height: 32 },
        { x: 82, y: 400, width: 280, height: 232 },
      ],
      'narrow',
    )
    const before = fitCamera({ frame: open, bounds })
    const after = fitCamera({ frame: covered, bounds })
    expect(after.y).toBeLessThan(before.y)
    const centerY = after.y + ((bounds.minY + bounds.maxY) / 2) * after.k
    expect(centerY).toBeGreaterThan(covered.y)
    expect(centerY).toBeLessThan(covered.y + covered.height)
  })

  it('moves Fit left of a wide side card', () => {
    const stage = { width: 960, height: 600 }
    const clear = fitCamera({ frame: visibleGraphFrame(stage, []), bounds })
    const beside = fitCamera({
      frame: visibleGraphFrame(stage, [{ x: 712, y: 8, width: 240, height: 180 }]),
      bounds,
    })
    expect(beside.x).toBeLessThan(clear.x)
    const centerX = beside.x
    expect(centerX).toBeLessThan(712)
  })

  it('centers the bounds in the padded free frame', () => {
    const frame = { x: 0, y: 40, width: 370, height: 300 }
    const camera = fitCamera({ frame, bounds: { minX: -50, minY: -20, maxX: 50, maxY: 20 } })
    expect(camera.x).toBeCloseTo(frame.x + 16 + (frame.width - 32) / 2)
    expect(camera.y).toBeCloseTo(frame.y + 16 + (frame.height - 32) / 2)
  })
})

describe('fitting measured captions', () => {
  it('uses the measured caption boxes, not a per-character estimate', () => {
    const frame = { x: 0, y: 0, width: 600, height: 400 }
    const camera = fitCameraWithLabels({
      frame,
      nodes: [
        { x: -140, y: 0, radius: 20, captionWidth: 40 },
        { x: 140, y: 0, radius: 20, captionWidth: 220 },
      ],
    })!
    // "Dark chocolate 70%" is wider than length * 3.6 / 2 would reserve.
    const right = camera.x + 140 * camera.k + 220 / 2
    const left = camera.x - 140 * camera.k - 40 / 2
    expect(right).toBeLessThanOrEqual(frame.x + frame.width - 16)
    expect(left).toBeGreaterThanOrEqual(frame.x + 16)
    expect(camera.k).toBeGreaterThan(0)
  })

  it('does not treat sheet chrome as measured until the inspector box exists', () => {
    expect(chromeMeasureReady('sheet', null)).toBe(false)
    expect(chromeMeasureReady('sheet', { x: 8, y: 420, width: 0, height: 212 })).toBe(false)
    expect(chromeMeasureReady('sheet', { x: 8, y: 420, width: 214, height: 212 })).toBe(true)
    expect(chromeMeasureReady('side', null)).toBe(true)
    expect(chromeMeasureReady('hidden', null)).toBe(true)
  })

  it('fits a smaller camera when a sheet-sized chrome box is measured', () => {
    const stage = { width: 600, height: 640 }
    const nodes = [
      { x: -100, y: -220, radius: 20, captionWidth: 80 },
      { x: 100, y: 220, radius: 20, captionWidth: 80 },
    ]
    const full = fitCameraWithLabels({ frame: readGraphFrame(stage, [], 'narrow'), nodes })!
    const sheet = fitCameraWithLabels({
      frame: readGraphFrame(stage, [{ x: 8, y: 420, width: 214, height: 212 }], 'narrow'),
      nodes,
    })!
    expect(sheet.k).toBeLessThan(full.k)
  })

  it('reserves room for a caption below a node in a short frame', () => {
    const frame = { x: 0, y: 0, width: 400, height: 220 }
    const camera = fitCameraWithLabels({
      frame,
      nodes: [{ x: 0, y: 0, radius: 24, captionWidth: 120 }],
    })!
    const labelBottom = camera.y + 24 * camera.k + 20
    const labelTop = camera.y - 24 * camera.k - 20
    expect(labelBottom).toBeLessThanOrEqual(frame.y + frame.height - 16)
    expect(labelTop).toBeGreaterThanOrEqual(frame.y + 16)
  })

  it('fits labels above a bottom inspector in a narrow pane', () => {
    const stage = { width: 230, height: 420 }
    const frame = readGraphFrame(stage, [{ x: 8, y: 280, width: 214, height: 132 }], 'narrow')
    expect(frame.height).toBeLessThan(stage.height - 100)
    const camera = fitCameraWithLabels({
      frame,
      nodes: [
        { x: -120, y: -20, radius: 18, captionWidth: 120 },
        { x: 100, y: 30, radius: 18, captionWidth: 60 },
      ],
    })!
    for (const node of [
      { x: -120, y: -20, r: 18, w: 120 },
      { x: 100, y: 30, r: 18, w: 60 },
    ]) {
      const center = camera.x + node.x * camera.k
      expect(center - node.w / 2).toBeGreaterThanOrEqual(frame.x + 16)
      expect(center + node.w / 2).toBeLessThanOrEqual(frame.x + frame.width - 16)
      const bottom = camera.y + node.y * camera.k + node.r * camera.k + 20
      expect(bottom).toBeLessThanOrEqual(frame.y + frame.height - 16)
    }
  })

  it('keeps a long selected caption after a fit into a 230 px pane with a bottom sheet', () => {
    const stage = { width: 230, height: 640 }
    const frame = readGraphFrame(stage, [{ x: 8, y: 420, width: 214, height: 212 }], 'narrow')
    const camera = fitCameraWithLabels({
      frame,
      nodes: [
        { x: 0, y: 0, radius: 22, captionWidth: 221 },
        { x: 70, y: 8, radius: 18, captionWidth: 30 },
      ],
    })!
    const caption = (id: string, priority: number, x: number, y: number, radius: number, textWidth: number) => {
      const centerX = camera.x + x * camera.k
      const width = textWidth + 8
      const placement = placeNodeLabel(camera.y + y * camera.k, radius * camera.k, stage.height)
      return {
        id,
        priority,
        left: centerX - width / 2,
        right: centerX + width / 2,
        top: placement.top,
        bottom: placement.bottom,
      }
    }
    const article = caption('article', 5, 0, 0, 22, 221)
    const value = caption('value', 0, 70, 8, 18, 30)
    // The old pane-minus-2 check dropped this 229 px box in a 230 px pane.
    expect(article.right - article.left).toBeCloseTo(229)
    expect(article.left).toBeGreaterThanOrEqual(frame.x)
    expect(article.right).toBeLessThanOrEqual(frame.x + frame.width + 0.5)
    const shown = visibleCaptionIds([article, value], camera.k, { paneWidth: stage.width })
    expect(shown.has('article'), 'the long object name stays painted').toBe(true)
    expect(shown.has('value'), 'the lower-priority neighbour still yields').toBe(false)
    // K5: a painted edge label may keep its spot; the caption beneath it hides
    // rather than forcing the label out (that is how Supplier used to vanish).
    const underLabel = visibleCaptionIds([article, value], camera.k, {
      paneWidth: stage.width,
      edgeLabels: [{ left: article.left, top: article.top, right: article.right, bottom: article.bottom }],
    })
    expect(underLabel.has('article'), 'the caption under the edge label yields').toBe(false)
  })
})

describe('remapping a user camera', () => {
  const from = { x: 0, y: 40, width: 220, height: 300 }
  const to = { x: 0, y: 0, width: 1200, height: 800 }

  it('keeps k and puts the old frame-centre world point at the new centre', () => {
    const camera = { k: 1.7, x: 30, y: 210 }
    const worldX = (from.x + from.width / 2 - camera.x) / camera.k
    const worldY = (from.y + from.height / 2 - camera.y) / camera.k
    const remapped = remapCamera({ camera, from, to })
    expect(remapped.k).toBe(camera.k)
    expect(remapped.x + worldX * remapped.k).toBeCloseTo(to.x + to.width / 2)
    expect(remapped.y + worldY * remapped.k).toBeCloseTo(to.y + to.height / 2)
  })

  it('round-trips back to the original camera when the frame returns', () => {
    const camera = { k: 0.8, x: 12, y: 90 }
    const there = remapCamera({ camera, from, to })
    const back = remapCamera({ camera: there, from: to, to: from })
    expect(back.k).toBeCloseTo(camera.k)
    expect(back.x).toBeCloseTo(camera.x)
    expect(back.y).toBeCloseTo(camera.y)
  })
})

const EDGE_SLACK = 12


describe('node label placement', () => {
  it('draws the caption below a node with room', () => {
    expect(placeNodeLabel(300, 20, 600)).toEqual({
      orientation: 'below',
      captionY: 332,
      subtitleY: 346,
      top: 324,
      bottom: 340,
    })
  })

  it('flips the caption above a node that sits on the bottom edge', () => {
    const placement = placeNodeLabel(560, 20, 600)
    expect(placement.orientation).toBe('above')
    expect(placement.captionY).toBe(528)
    expect(placement.top).toBeGreaterThanOrEqual(4)
    expect(placement.bottom).toBeLessThanOrEqual(596)
  })

  it('reserves room for an active subtitle when it flips', () => {
    const placement = placeNodeLabel(545, 20, 600, true)
    expect(placement.orientation).toBe('above')
    expect(placement.captionY).toBe(499)
    expect(placement.subtitleY).toBe(485)
    expect(placement.top).toBeGreaterThanOrEqual(4)
    expect(placement.bottom).toBeLessThanOrEqual(596)
  })

  it('clamps to the pane instead of clipping in a tiny frame', () => {
    const placement = placeNodeLabel(620, 24, 60)
    expect(placement.captionY).toBeGreaterThanOrEqual(12)
    expect(placement.captionY).toBeLessThanOrEqual(48)
    expect(placement.top).toBeGreaterThanOrEqual(0)
    expect(placement.bottom).toBeLessThanOrEqual(60)
  })
})
