import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Force,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { ChevronDown, Link2, List, Pin, PinOff, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { api, catalogName, searchQuery, textValue, type Json } from './api'
import { Button } from './components/ui/button'
import { MetaChip, typeLabel } from './chips'
import {
  buildScene,
  capScene,
  expandStructure,
  expandClass,
  groupMembers,
  isLegendHidden,
  kindLabel,
  labelPriority,
  legendEntries,
  mergeScene,
  NAMED_CAPTION_PRIORITY,
  nodeMark,
  nodeRadius,
  parseTypedId,
  placedSceneNodes,
  searchDocuments,
  visibleCaptionIds,
  type KnownObject,
  type LabelBox,
  type NodeKind,
  type Scene,
  type SceneNode,
} from './graph-scene'
import {
  chromeMeasureReady,
  chromeSheetBoxSettled,
  createPaneSettleGate,
  createFitScheduler,
  detailPlacement,
  type CaptionExtent,
  fitCameraWithLabels,
  graphDensity,
  inspectorChrome,
  legendLayout,
  nodeSummary,
  placeNodeLabel,
  propertiesOpen,
  readGraphFrame,
  remapCamera,
  requestSystemFit,
  sheetAfterGesture,
  type Box,
  type DetailPlacement,
  type FitScheduler,
  type GraphDensity,
  type GraphFrame,
  type SheetMode,
  type SystemFitEvent,
} from './graph-chrome'
import { buildModelScene, expandModelType, mergeModelScene } from './graph-model-scene'
import { curvePoint, edgeLabelMode, placeEdgeLabelWithFallback, type EdgeLabelBox } from './graph-edge-label'
import { chooseModelSelection } from './model-selection'
import { openObjectLabel } from './type-labels'
import { copy, uiLanguage } from './i18n'
import { linkChoices } from './link-section'
import { LinkAddFlow, type LinkAddRequest, type Rect } from './link-add'
import { openSharedContextMenu, prefersNativeContextMenu } from './shared-context-menu'
import { registerCommandRunner, type CommandTarget, type RegistryCommand } from './command-registry'
import { requestOpenModelType } from './model-type-open'

type SimNode = SimulationNodeDatum & SceneNode & { degree: number }
type SimLink = SimulationLinkDatum<SimNode> & { id: string; label: string }
type Marker = {
  x: number
  y: number
  r: number
  label: Rect
  /** The same label rectangle in canvas-local coordinates, for the DOM mirror. */
  localLabel: Rect
  shown: boolean
}
const NO_GRAPH: Json = {}

// How long the Event D observer waits (after a rAF) before accepting an
// unchanged inspector box as the settled sheet. Long enough that a late name
// or caption reflow cannot slip between two otherwise identical layouts, but
// far shorter than post-settle content growth (add-link, expand), which must
// never refit an untouched camera.
const SHEET_QUIET_MS = 160

/**
 * Object, model-type, attribute value and structure nodes can open their own
 * graph menu. Group, class and structure nodes expand from their own menu.
 */
export function canOpenGraphNodeMenu(node: Pick<SceneNode, 'kind' | 'typeKey'>) {
  if (node.kind === 'object' || node.kind === 'type') return Boolean(node.typeKey)
  return node.kind === 'value' || node.kind === 'group' || node.kind === 'class' || node.kind === 'structure'
}

/** The owning object of a `value:<objectId>:<attribute>` node. */
export function valueNodeObjectId(node: Pick<SceneNode, 'id' | 'kind'>) {
  if (node.kind !== 'value') return ''
  const parts = node.id.split(':')
  return parts.length > 2 && parts[0] === 'value' ? parts[1] ?? '' : ''
}

/**
 * Node-scoped items for the graph menu. A model type is not an object: its
 * entries are type actions (open it in Object types), never object links.
 * Object nodes get one verb per relation and direction; the runner opens the
 * shared add-link picker for exactly that relation.
 */
export function graphNodeMenuExtras(
  defs: Json | undefined,
  node: Pick<SceneNode, 'kind' | 'typeKey' | 'caption'>,
): RegistryCommand[] {
  if (node.kind === 'value') {
    return [
      {
        id: 'graph:value:open',
        title: copy.openValue,
        contexts: ['graph-node'],
        group: 'object',
        palette: false,
      },
    ]
  }
  if (node.kind === 'type') {
    return [
      {
        id: 'graph:type:view',
        title: openObjectLabel(node.caption),
        contexts: ['graph-node'],
        group: 'object',
        palette: false,
      },
    ]
  }
  if (node.kind === 'group' || node.kind === 'class' || node.kind === 'structure') {
    return [
      {
        id: 'graph:node:expand',
        title: node.kind === 'group' ? copy.showMembers : copy.expand,
        contexts: ['graph-node'],
        group: 'object',
        palette: false,
      },
    ]
  }
  const choices = linkChoices(defs, node.typeKey ?? '')
  return choices.map((choice) => ({
    id: `graph:add-link:${choice.key}:${choice.direction}`,
    title: graphLinkMenuTitle(choice, choices),
    contexts: ['graph-node'],
    group: 'object',
    palette: false,
  }))
}

/** Verb first, and the side when two directions share the same relation label. */
export function graphLinkMenuTitle(
  choice: { label: string; direction: 'out' | 'in' },
  all: Array<{ label: string; direction: 'out' | 'in' }>,
) {
  const shared = all.filter((item) => item.label === choice.label).length > 1
  const label = shared
    ? `${choice.label} · ${choice.direction === 'out' ? copy.linkFromHere : copy.linkToHere}`
    : choice.label
  return copy.linkMenuVerb.replace('{label}', label)
}

/** The object key a graph node already carries as its number property. */
export function graphNodeKey(node: Pick<SceneNode, 'properties'> | { properties?: SceneNode['properties'] }) {
  const property = (node.properties ?? []).find((item) => item.label === copy.number)
  return String(property?.value ?? '')
}

/** A model type is not an object: never hand its node id to an object command. */
export function graphNodeTarget(
  node: Pick<SceneNode, 'kind' | 'id' | 'typeKey'> & {
    objectId?: string
    caption?: string
    properties?: SceneNode['properties']
  },
): CommandTarget {
  if (node.kind === 'value') {
    const objectId = valueNodeObjectId({ id: node.id, kind: node.kind })
    return {
      ...(objectId ? { objectId } : {}),
      ...(node.typeKey ? { typeKey: node.typeKey } : {}),
      ...(node.caption ? { sourceName: node.caption } : {}),
    }
  }
  if (node.kind !== 'object') return { typeKey: node.typeKey }
  const key = graphNodeKey(node)
  return {
    objectId: node.objectId ?? node.id,
    typeKey: node.typeKey,
    ...(key ? { sourceKey: key } : {}),
    ...(node.caption ? { sourceName: node.caption } : {}),
  }
}

/** The menu opens beside the visible node so it never covers the node label. */
export function nodeMenuAnchor(marker: Pick<Marker, 'x' | 'y'> & { r?: number } | undefined, fallback: { x: number; y: number }) {
  if (marker && Number.isFinite(marker.x) && Number.isFinite(marker.y)) {
    const radius = Number.isFinite(marker.r) ? Number(marker.r) : 0
    return { x: marker.x + radius + 8, y: marker.y - radius }
  }
  return fallback
}

/** Keep a caption inside the pane even when its node sits on the edge. */
export function clampLabelCenter(centerX: number, labelWidth: number, paneWidth: number, margin = 4) {
  const half = labelWidth / 2
  const min = margin + half
  const max = paneWidth - margin - half
  if (min >= max) return paneWidth / 2
  return Math.min(Math.max(centerX, min), max)
}

/**
 * The circle plus the measured caption rectangle under it, in client
 * coordinates. Falls back to an estimate before the canvas has measured it.
 */
export function nodeMenuAvoid(
  marker: (Pick<Marker, 'x' | 'y'> & { r?: number; label?: Rect }) | undefined,
  caption: string,
): Rect | undefined {
  if (!marker || !Number.isFinite(marker.x) || !Number.isFinite(marker.y)) return undefined
  const radius = Number.isFinite(marker.r) ? Number(marker.r) : 0
  const labelWidth = Math.max(radius * 2, caption.trim().length * 7 + 16)
  const fallback = {
    left: marker.x - labelWidth / 2,
    top: marker.y - radius,
    right: marker.x + labelWidth / 2,
    bottom: marker.y + radius + 22,
  }
  if (!marker.label) return fallback
  return {
    left: Math.min(marker.x - radius, marker.label.left),
    top: Math.min(marker.y - radius, marker.label.top),
    right: Math.max(marker.x + radius, marker.label.right),
    bottom: Math.max(marker.y + radius, marker.label.bottom),
  }
}

/** Every visible circle and measured label a graph menu must try to avoid. */
export function nodeObstacles(
  markers: Record<string, Pick<Marker, 'x' | 'y' | 'r'> & { label?: Rect }>,
): Rect[] {
  const rects: Rect[] = []
  for (const marker of Object.values(markers)) {
    if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) continue
    rects.push({
      left: marker.x - marker.r,
      top: marker.y - marker.r,
      right: marker.x + marker.r,
      bottom: marker.y + marker.r,
    })
    if (marker.label) rects.push({ ...marker.label })
  }
  return rects
}

/**
 * Whether a node is still pinned after pointer-up. A click never releases an
 * existing pin; a drag pins the node where it is dropped (set while moving).
 * The model graph keeps its old drag behaviour and only preserves pins it
 * already had.
 */
export function staysPinnedAfterPointerUp(wasPinned: boolean, dragged: boolean, modelMode = false) {
  if (wasPinned) return true
  return !modelMode && dragged
}

/**
 * Decide whether a scene change may idle-refit the camera. During the initial
 * load (settled=false) nodes and captions that arrive a moment after the first
 * paint may fit again. Once the initial load has settled the id baseline is
 * frozen: add-link / expand growth, inspector content and late captions are
 * all content then, and only events B, C and D may move the camera.
 */
export function idleRefitPlan(input: {
  settled: boolean
  baselineIds: string | null
  ids: string
  captions: string
  previousCaptions: string
  moved: boolean
}): { fit: boolean; baselineIds: string | null } {
  const changed = input.previousCaptions !== input.captions
  if (input.moved) return { fit: false, baselineIds: input.baselineIds }
  if (input.settled) {
    const baseline = input.baselineIds ?? input.ids
    return { fit: false, baselineIds: baseline }
  }
  return { fit: changed, baselineIds: input.baselineIds }
}

/** Identify the caption text that the last draw measured into real label boxes. */
function captionSignature(nodes: Array<{ caption: string }>): string {
  return nodes.map((node) => node.caption).join('\u0000')
}

/** Reserve fit room for link peers that are not in the sim until their names resolve. */
export function pendingPeerFitExtents(
  scene: Scene,
  focusKey: string,
  simNodes: SimNode[],
  captionWidth: (node: SceneNode) => number,
): CaptionExtent[] {
  const placed = new Map(
    simNodes
      .filter((node) => node.x != null && node.y != null)
      .map((node) => [node.id, node]),
  )
  const anchor = placed.get(focusKey)
  if (!anchor || anchor.x == null || anchor.y == null) return []
  const peers: SceneNode[] = []
  for (const edge of scene.edges) {
    if (edge.source !== focusKey && edge.target !== focusKey) continue
    const peerId = edge.source === focusKey ? edge.target : edge.source
    if (placed.has(peerId)) continue
    const node = scene.nodes.find((item) => item.id === peerId)
    if (node?.kind === 'object' && node.rawCaption) peers.push(node)
  }
  return peers.map((node, index) => {
    const angle = (index / Math.max(1, peers.length)) * Math.PI * 2
    const degree = 2
    const dist = 72 + nodeRadius(node.kind, degree) + nodeRadius(anchor.kind, anchor.degree ?? 0)
    return {
      x: anchor.x + Math.cos(angle) * dist,
      y: anchor.y + Math.sin(angle) * dist,
      radius: nodeRadius(node.kind, degree),
      captionWidth: captionWidth(node),
    }
  })
}

/** Web fonts must not swap a caption after its box was measured for a fit. */
function fontsReady(): boolean {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  return !fonts || fonts.status !== 'loading'
}

/**
 * A narrow bottom inspector card is open or about to become a sheet. After a
 * real F5 the placement can still be `hidden` while the selected object
 * resolves, so `placement === 'sheet'` alone would treat that frame as complete.
 */
function bottomCardOpenAt(
  density: GraphDensity,
  selected: string,
  sheet: SheetMode,
  placement: DetailPlacement,
): boolean {
  return (
    density === 'narrow' &&
    Boolean(selected) &&
    sheet !== 'dismissed' &&
    sheet !== 'chip' &&
    placement !== 'side'
  )
}

/** A narrow open bottom card needs its measured box before the first untouched fit. */
function deferInitialFitForSheet(
  density: GraphDensity,
  selected: string,
  sheet: SheetMode,
  placement: DetailPlacement,
): boolean {
  return density === 'narrow' && (placement === 'sheet' || bottomCardOpenAt(density, selected, sheet, placement))
}

/** `graph:add-link:<key>:<direction>`; the direction is what the picker must use. */
export function graphLinkRequest(id: string, target: CommandTarget): LinkAddRequest {
  const value = id.slice('graph:add-link:'.length)
  const split = value.lastIndexOf(':')
  const linkType = split < 0 ? value : value.slice(0, split)
  const rawDirection = split < 0 ? '' : value.slice(split + 1)
  const direction = rawDirection === 'out' || rawDirection === 'in' ? rawDirection : undefined
  return {
    ...(linkType ? { linkType } : {}),
    ...(direction ? { direction } : {}),
    ...(target.objectId ? { objectId: String(target.objectId) } : {}),
    ...(target.typeKey ? { typeKey: String(target.typeKey) } : {}),
    ...(target.sourceKey ? { sourceKey: String(target.sourceKey) } : {}),
    ...(target.sourceName ? { sourceName: String(target.sourceName) } : {}),
    ...(target.anchor ? { anchor: target.anchor as Rect } : {}),
    ...(target.stage ? { stage: target.stage as Rect } : {}),
  }
}

export function runGraphNodeCommand(
  id: string,
  target: CommandTarget,
  onAddLink?: (request: LinkAddRequest) => void,
  onExpand?: () => void,
) {
  if (id === 'graph:node:expand') {
    onExpand?.()
    return
  }
  if (id === 'graph:type:view') {
    if (target.typeKey) requestOpenModelType(String(target.typeKey))
    return
  }
  if (id === 'graph:value:open') {
    if (target.objectId) {
      window.dispatchEvent(
        new CustomEvent('braian:command', { detail: { id: 'object:open', target } }),
      )
    }
    return
  }
  if (!id.startsWith('graph:add-link:')) return
  const request = graphLinkRequest(id, target)
  if (onAddLink) {
    onAddLink(request)
    return
  }
  window.dispatchEvent(
    new CustomEvent('braian-add-link', {
      detail: { ...(request.linkType ? { linkType: request.linkType } : {}), ...(request.direction ? { direction: request.direction } : {}) },
    }),
  )
}

/** Node-scoped shared menu for a graph node, anchored at the pointer or node. */
export function openGraphNodeMenu(
  node: Pick<SceneNode, 'kind' | 'id' | 'typeKey' | 'caption'> & {
    objectId?: string
    properties?: SceneNode['properties']
  },
  defs: Json | undefined,
  x: number,
  y: number,
  onAddLink?: (request: LinkAddRequest) => void,
  avoid?: Rect,
  stage?: Rect,
  obstacles?: Rect[],
  bounds?: Rect,
  dialogAnchor?: Rect,
  onExpand?: () => void,
) {
  const extra = graphNodeMenuExtras(defs, node)
  const target = {
    ...graphNodeTarget(node),
    ...(dialogAnchor || avoid ? { anchor: dialogAnchor ?? avoid } : {}),
    ...(stage ? { stage } : {}),
  }
  for (const command of extra) {
    registerCommandRunner(command.id, (next) => runGraphNodeCommand(command.id, { ...target, ...next }, onAddLink, onExpand))
  }
  openSharedContextMenu({
    context: 'graph-node',
    x,
    y,
    target,
    extraOnly: true,
    extra,
    avoid,
    obstacles,
    ...(bounds ? { bounds } : {}),
  })
}

type Palette = {
  fill: Record<NodeKind, string>
  text: string
  text2: string
  muted: string
  bg: string
  border: string
  raised: string
}

export function GraphMap({
  data,
  values,
  defs,
  onOpen,
  model: modelInput,
}: {
  data?: Json
  values?: Json
  defs?: Json
  onOpen?: (id: string) => void
  model?: { defs?: Json; stats?: Json }
}) {
  const modelMode = modelInput !== undefined
  const graph = data ?? NO_GRAPH
  const activeDefs = modelMode ? modelInput?.defs : defs
  const openObject = onOpen ?? (() => {})
  const focusId = modelMode ? 'data-model' : String(graph.id ?? '')
  const focusKey = modelMode ? '' : `object:${focusId}`
  const [seen, setSeen] = useState(focusId)
  const [extras, setExtras] = useState<Scene[]>([])
  const [known, setKnown] = useState<Record<string, KnownObject>>({})
  const [selected, setSelected] = useState(focusKey)
  const [focused, setFocused] = useState('')
  const menuFocusRef = useRef('')
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [full, setFull] = useState(false)
  const [markers, setMarkers] = useState<Record<string, Marker>>({})
  const [shownEdges, setShownEdges] = useState<Set<string>>(() => new Set())
  const markersRef = useRef<Record<string, Marker>>({})
  const shownEdgesRef = useRef('')
  const edgeLabelRectsRef = useRef<Record<string, Rect>>({})
  const [pinTick, setPinTick] = useState(0)
  const [busy, setBusy] = useState('')
  const [add, setAdd] = useState<LinkAddRequest | null>(null)
  const [sheet, setSheet] = useState<SheetMode>('compact')
  const [pane, setPane] = useState<{ width: number; height: number } | null>(null)
  const expandedRef = useRef(new Set<string>([focusKey]))
  const inflightRef = useRef(new Set<string>())
  const defsRef = useRef(activeDefs)
  defsRef.current = activeDefs

  if (seen !== focusId) {
    setSeen(focusId)
    setExtras([])
    setKnown({})
    setSelected(focusKey)
    setHidden(new Set())
    setFull(false)
    setAdd(null)
    setSheet('compact')
    expandedRef.current = new Set([focusKey])
  }

  const model = useMemo(() => {
    let merged = modelMode
      ? buildModelScene(activeDefs, modelInput?.stats)
      : buildScene({ graph: graph, values, defs, known })
    for (const extra of extras) {
      merged = modelMode ? mergeModelScene(merged, extra) : mergeScene(merged, extra)
    }
    return capScene(merged)
  }, [modelMode, graph, values, activeDefs, known, extras, modelInput?.stats])
  const scene = model.scene
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const focusKeyRef = useRef(focusKey)
  focusKeyRef.current = focusKey
  const placed = useMemo(() => placedSceneNodes(scene, focusKey), [scene, focusKey])
  const placedRef = useRef(placed)
  placedRef.current = placed
  const pendingNames = useMemo(
    () =>
      modelMode
        ? ''
        : scene.nodes
            .filter((node) => node.kind === 'object' && node.rawCaption && node.objectId)
            .map((node) => node.objectId ?? '')
            .filter(Boolean)
            .sort()
            .join(','),
    [modelMode, scene],
  )
  const knownRef = useRef(known)
  knownRef.current = known
  const fitAfterRef = useRef(true)
  const movedRef = useRef(false)
  const idleIdsRef = useRef<string | null>(null)
  const idleCaptionsRef = useRef('')
  // The initial load may refit repeatedly while nodes, captions and chrome
  // arrive. It settles only after the simulation has ended, no object name is
  // still pending, the chrome has been measured and the scene stayed quiet.
  const initialSettledRef = useRef(false)
  const initialEndedRef = useRef(false)
  const chromeMeasuredRef = useRef(false)
  // False while an open bottom sheet is still settling; the first-fit baseline
  // must not freeze on a mid-transition height (Event D flips this to true).
  const sheetStableRef = useRef(false)
  const placementRef = useRef<DetailPlacement>('hidden')
  const sheetRef = useRef<SheetMode>('compact')
  const pendingNamesRef = useRef('')
  const currentIdsRef = useRef('')
  // The caption signature whose real label boxes the last draw measured.
  const labelsDrawnRef = useRef('')
  pendingNamesRef.current = pendingNames

  useEffect(() => {
    const ids = pendingNames.split(',').filter(Boolean)
    if (!ids.length) return
    let cancel = false
    const settle = (found: Record<string, KnownObject>) => {
      if (cancel) return
      setKnown((current) => {
        const next = { ...current }
        let changed = false
        for (const id of ids) {
          if (next[id]) continue
          next[id] = found[id] ?? { name: '', typeKey: '' }
          changed = true
        }
        return changed ? next : current
      })
    }
    void lookupNames(ids).then(settle).catch(() => settle({}))
    return () => {
      cancel = true
    }
  }, [pendingNames])

  const legend = useMemo(() => legendEntries(placed.nodes), [placed])
  const counts = useMemo(() => {
    const tally: Record<string, number> = {}
    for (const node of placed.nodes) {
      const id = node.kind === 'object' && node.typeKey ? `type-${node.typeKey}` : node.kind
      tally[id] = (tally[id] ?? 0) + 1
    }
    return tally
  }, [placed])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const inspectorRef = useRef<HTMLElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const densityRef = useRef<GraphDensity>('wide')
  const settledPaneWidthRef = useRef(0)
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const drawRef = useRef<(shouldPublish: boolean) => void>(() => {})
  const apiRef = useRef<{
    fit: () => void
    remap: () => void
    relayout: () => void
    refocus: () => void
    markerOf: (id: string) => { x: number; y: number; r: number } | undefined
  }>({ fit: () => {}, remap: () => {}, relayout: () => {}, refocus: () => {}, markerOf: () => undefined })
  const hiddenRef = useRef(hidden)
  const selectedRef = useRef(selected)
  const focusedRef = useRef(focused)
  const expandRef = useRef<(node: SceneNode) => void>(() => {})
  const selectRef = useRef<(id: string) => void>(() => {})
  const pinRef = useRef(setPinTick)
  // Every system fit goes through this one scheduler. It carries the event that
  // asked for the fit so it can re-check the free frame when the timers run.
  const runSystemFitRef = useRef<(event: SystemFitEvent) => void>(() => {})
  const requestSystemFitRef = useRef<(event: SystemFitEvent) => void>(() => {})
  const fitSchedulerRef = useRef<FitScheduler | null>(null)
  const paneSettleRef = useRef(createPaneSettleGate())
  if (fitSchedulerRef.current === null) {
    fitSchedulerRef.current = createFitScheduler((event) => runSystemFitRef.current(event))
  }
  hiddenRef.current = hidden
  selectedRef.current = selected
  focusedRef.current = focused
  sheetRef.current = sheet
  selectRef.current = (id: string) => {
    setSelected(id)
    setSheet((mode) => (mode === 'dismissed' || mode === 'chip' ? 'compact' : mode))
    if (!modelMode) return
    const node = scene.nodes.find((item) => item.id === id)
    if (node?.kind === 'type' && node.typeKey) chooseModelSelection({ kind: 'type', typeKey: node.typeKey })
  }
  pinRef.current = setPinTick

  // Once the user grows the graph (expand or add-link), stop treating later
  // scene changes as part of the initial load. Freeze the pre-growth ids so the
  // new arrivals never idle-refit, even if the initial timer has not fired.
  const freezeIdleForUser = () => {
    if (initialSettledRef.current) return
    if (idleIdsRef.current == null) idleIdsRef.current = currentIdsRef.current
    initialSettledRef.current = true
  }

  const openAddLink = (request: LinkAddRequest) => {
    freezeIdleForUser()
    setAdd(request)
  }

  const expand = async (node: SceneNode) => {
    if (!node || expandedRef.current.has(node.id) || inflightRef.current.has(node.id)) return
    freezeIdleForUser()
    if (node.kind === 'value') {
      expandedRef.current.add(node.id)
      return
    }
    if (modelMode && node.kind === 'type' && node.typeKey) {
      expandedRef.current.add(node.id)
      const extra = expandModelType(defsRef.current, node.typeKey)
      if (extra.nodes.length || extra.edges.length) setExtras((current) => [...current, extra])
      return
    }
    if (modelMode && node.kind === 'group') {
      expandedRef.current.add(node.id)
      return
    }
    expandedRef.current.add(node.id)
    inflightRef.current.add(node.id)
    setBusy(node.id)
    try {
      let extra: Scene = { nodes: [], edges: [] }
      if (node.kind === 'object' && node.objectId) {
        const [graph, object] = await Promise.all([
          api.get('/v1/objects/{id}/graph', { params: { path: { id: node.objectId } } }),
          api.get('/v1/objects/{id}', { params: { path: { id: node.objectId } } }),
        ])
        const linkIds = ((graph.links as Json[]) ?? []).map((item) => String(item.object_id ?? '')).filter(Boolean)
        const nextKnown = await resolveNames([String(graph.id ?? node.objectId), ...linkIds], knownRef.current)
        knownRef.current = nextKnown
        setKnown(nextKnown)
        extra = buildScene({
          graph,
          values: (object.values as Json) ?? {},
          defs: defsRef.current,
          known: nextKnown,
        })
      } else if (node.kind === 'class' || node.kind === 'group' || node.kind === 'structure') {
        const parsed = parseTypedId(node.id)
        if (node.kind === 'class') extra = expandClass(defsRef.current, parsed.structure, parsed.key)
        if (node.kind === 'structure') extra = expandStructure(defsRef.current, parsed.structure)
        if (node.kind === 'group') {
          const params = new URLSearchParams({
            filter: `groups:=${parsed.structure}:${parsed.key}`,
            per_page: '40',
            lang: uiLanguage,
          })
          const body = await api.get('/v1/search', { params: { query: searchQuery(params) } })
          const hits = searchDocuments(body).map((doc) => {
            const name = catalogName(doc)
            return {
              id: String(doc.id ?? ''),
              key: String(doc.key ?? ''),
              name,
              type: typeLabel(defsRef.current, String(doc.type_key ?? ''), uiLanguage),
              typeKey: String(doc.type_key ?? ''),
              rawCaption: !name,
            }
          })
          const nextKnown = await resolveNames(
            hits.map((hit) => hit.id),
            knownRef.current,
          )
          knownRef.current = nextKnown
          setKnown(nextKnown)
          const named = hits.map((hit) => {
            const record = nextKnown[hit.id]
            const name = record?.name || hit.name
            const type = record?.typeKey ? typeLabel(defsRef.current, record.typeKey, uiLanguage) || hit.type : hit.type
            return { ...hit, name, type, rawCaption: !name }
          })
          extra = groupMembers(parsed.structure, parsed.key, named, defsRef.current)
        }
      }
      if (extra.nodes.length || extra.edges.length) setExtras((current) => [...current, extra])
    } catch {
      expandedRef.current.delete(node.id)
    } finally {
      inflightRef.current.delete(node.id)
      setBusy('')
    }
  }
  expandRef.current = (node) => {
    void expand(node)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const transform = { x: 0, y: 0, k: 1 }
    const hoverRef = { id: '' }
    const paletteRef: { current: Palette | null } = { current: null }
    const markerSerial = { current: '' }
    let alive = true
    let lastFrame: GraphFrame | null = null
    let settleTimer: ReturnType<typeof setTimeout> | undefined

    const sim = forceSimulation<SimNode, SimLink>([])
      .force(
        'link',
        forceLink<SimNode, SimLink>([])
          .id((node) => node.id)
          .distance((link) => 72 + endRadius(link.source) + endRadius(link.target))
          .strength(0.25),
      )
      .force('charge', forceManyBody<SimNode>().strength(-560).distanceMax(820))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<SimNode>().radius((node) => nodeRadius(node.kind, node.degree ?? 0) + 4).iterations(2))
      .force('labels', labelCollision())
      .alphaDecay(reduced ? 0.2 : 0.032)
      .velocityDecay(0.5)
      .stop()
    simRef.current = sim

    const readPalette = (): Palette => {
      if (paletteRef.current) return paletteRef.current
      const root = getComputedStyle(document.documentElement)
      const token = (name: string) => root.getPropertyValue(name).trim()
      const swatch = (kind: NodeKind) => {
        const el = document.querySelector<HTMLElement>(`[data-swatch='${kind}']`)
        return el ? getComputedStyle(el).backgroundColor : token('--accent')
      }
      paletteRef.current = {
        fill: {
          object: swatch('object'),
          type: swatch('type'),
          class: swatch('class'),
          group: swatch('group'),
          value: swatch('value'),
          structure: swatch('structure'),
        },
        text: token('--text'),
        text2: token('--text-2'),
        muted: token('--muted'),
        bg: token('--bg'),
        border: token('--border'),
        raised: token('--raised'),
      }
      return paletteRef.current
    }

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const nextW = Math.max(1, Math.floor(width * dpr))
      const nextH = Math.max(1, Math.floor(height * dpr))
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW
        canvas.height = nextH
      }
      if (!movedRef.current && transform.x === 0 && transform.y === 0 && width > 0) {
        transform.x = width / 2
        transform.y = height / 2
      }
    }

    const currentFrame = () => {
      const stage = { width: canvas.clientWidth, height: canvas.clientHeight }
      return readGraphFrame(
        stage,
        measureChromeBoxes(canvas, [inspectorRef.current, legendRef.current]),
        densityRef.current,
      )
    }

    const bottomCardOpen = () =>
      bottomCardOpenAt(densityRef.current, selectedRef.current, sheetRef.current, placementRef.current)

    // A bottom sheet is expected when the placement is a sheet or the card is
    // open while the placement is still resolving (F5). Only then must the
    // sheet have settled before the chrome counts as ready.
    const sheetExpected = () => placementRef.current === 'sheet' || bottomCardOpen()

    // A `sheet` placement without a measured, settled inspector box is not
    // settled chrome: the open bottom sheet still has to shrink the free frame.
    const sideCardOpen = () =>
      densityRef.current === 'wide' &&
      Boolean(selectedRef.current) &&
      propertiesOpen(densityRef.current, sheetRef.current)
    const chromeReady = () =>
      chromeMeasuredRef.current &&
      (!sheetExpected() || sheetStableRef.current) &&
      paneSettleRef.current.settled &&
      chromeMeasureReady(
        placementRef.current,
        measureChromeBox(canvas, inspectorRef.current),
        bottomCardOpen(),
        sideCardOpen(),
      )

    const labelsReady = () =>
      fontsReady() && labelsDrawnRef.current === captionSignature(sim.nodes())
    const simMatchesPlaced = () => {
      const simIds = new Set(sim.nodes().map((node) => node.id))
      const layout = placedRef.current.nodes
      return layout.length === sim.nodes().length && layout.every((node) => simIds.has(node.id))
    }
    const objectNamesReady = () =>
      !sceneRef.current.nodes.some((node) => node.kind === 'object' && node.rawCaption)

    // Freeze the idle-refit baseline only after the first load has genuinely
    // settled. Until then Food and other late nodes/captions may still fit.
    const scheduleInitialSettle = () => {
      if (initialSettledRef.current || movedRef.current) return
      if (
        !initialEndedRef.current ||
        pendingNamesRef.current !== '' ||
        !objectNamesReady() ||
        !simMatchesPlaced() ||
        !chromeReady() ||
        !labelsReady()
      )
        return
      if (settleTimer !== undefined) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        settleTimer = undefined
        if (movedRef.current || !initialEndedRef.current) return
        if (
          pendingNamesRef.current !== '' ||
          !objectNamesReady() ||
          !simMatchesPlaced() ||
          !chromeReady() ||
          !labelsReady()
        )
          return
        initialSettledRef.current = true
        if (idleIdsRef.current == null) idleIdsRef.current = currentIdsRef.current
      }, 500)
    }

    const remap = () => {
      resize()
      const next = currentFrame()
      if (lastFrame && movedRef.current) {
        const camera = remapCamera({ camera: transform, from: lastFrame, to: next })
        transform.k = camera.k
        transform.x = camera.x
        transform.y = camera.y
      }
      lastFrame = next
      draw(true)
    }

    const screenOf = (x: number, y: number) => ({
      x: transform.x + x * transform.k,
      y: transform.y + y * transform.k,
    })

    // Mouse coordinates local to the canvas. A fixed full-size graph can make
    // `offsetX` disagree with the drawn position, so context-menu hit testing
    // uses the client rect instead.
    const localPoint = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const focusNodeButton = (id: string, root: Element = canvas) => {
      const button = root
        .closest('.graph-wrap')
        ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)
      if (!button) return
      button.focus({ preventScroll: true })
      // Keep the node selected in the a11y layer too: a menu close or a
      // browser focus steal must not lose the ring or the next Shift+F10.
      setFocused(id)
      if (document.activeElement !== button) {
        requestAnimationFrame(() => {
          if (button.isConnected && document.activeElement !== button) button.focus({ preventScroll: true })
        })
      }
    }

    const hitTest = (ox: number, oy: number) => {
      const wx = (ox - transform.x) / transform.k
      const wy = (oy - transform.y) / transform.k
      const nodes = sim.nodes()
      const slop = 10 / transform.k
      let best: SimNode | undefined
      let bestDistance = Infinity
      for (const node of nodes) {
        if (!node || isLegendHidden(hiddenRef.current, node) || node.x == null || node.y == null) continue
        const reach = nodeRadius(node.kind, node.degree ?? 0) + slop
        const distance = (node.x - wx) ** 2 + (node.y - wy) ** 2
        // The closest node inside the slop wins, so an exactly centred click
        // on the hub still hits it when a neighbour overlaps the slop ring.
        if (distance <= reach ** 2 && distance < bestDistance) {
          best = node
          bestDistance = distance
        }
      }
      return best
    }

    const highlightedIds = () => {
      const highlight = new Set<string>()
      const hover = hoverRef.id
      if (!hover) return highlight
      highlight.add(hover)
      const links = sim.force<ForceLink<SimNode, SimLink>>('link')?.links() ?? []
      for (const link of links) {
        const source = endId(link.source)
        const target = endId(link.target)
        if (source === hover) highlight.add(target)
        if (target === hover) highlight.add(source)
      }
      return highlight
    }

    const publish = (shown: Set<string>) => {
      const rect = canvas.getBoundingClientRect()
      const next: Record<string, Marker> = {}
      const highlight = highlightedIds()
      const current = selectedRef.current
      context.save()
      context.font = '12px "Inter Variable", Inter, sans-serif'
      for (const node of sim.nodes()) {
        if (isLegendHidden(hiddenRef.current, node) || node.x == null || node.y == null) continue
        const point = screenOf(node.x, node.y)
        const labelRadius = nodeRadius(node.kind, node.degree ?? 0) * transform.k
        const radius = Math.round(labelRadius)
        const textWidth = context.measureText(node.caption).width
        const active = node.id === current || highlight.has(node.id)
        const placement = placeNodeLabel(
          point.y,
          labelRadius,
          canvas.clientHeight,
          active && Boolean(node.subtitle) && transform.k >= 0.6,
        )
        const tooWide = textWidth + 8 > canvas.clientWidth - 2
        const centerX = clampLabelCenter(point.x, textWidth, canvas.clientWidth)
        const label = tooWide
          ? {
              left: Math.round(rect.left + point.x - radius),
              top: Math.round(rect.top + point.y - radius),
              right: Math.round(rect.left + point.x + radius),
              bottom: Math.round(rect.top + point.y + radius),
            }
          : {
              left: Math.round(rect.left + centerX - textWidth / 2 - 4),
              top: Math.round(rect.top + placement.captionY - 8),
              right: Math.round(rect.left + centerX + textWidth / 2 + 4),
              bottom: Math.round(rect.top + placement.captionY + 8),
            }
        const marker = {
          x: Math.round(rect.left + point.x),
          y: Math.round(rect.top + point.y),
          r: radius,
          label,
          localLabel: {
            left: label.left - rect.left,
            top: label.top - rect.top,
            right: label.right - rect.left,
            bottom: label.bottom - rect.top,
          },
          shown: shown.has(node.id),
        }
        next[node.id] = marker
        const button = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(node.id)}"]`)
        if (button) {
          button.setAttribute('data-x', String(marker.x))
          button.setAttribute('data-y', String(marker.y))
          button.setAttribute('data-r', String(marker.r))
          button.setAttribute('data-label-left', String(label.left))
          button.setAttribute('data-label-top', String(label.top))
          button.setAttribute('data-label-right', String(label.right))
          button.setAttribute('data-label-bottom', String(label.bottom))
        }
      }
      context.restore()
      markersRef.current = next
      const serial = JSON.stringify(next)
      if (serial === markerSerial.current) return
      markerSerial.current = serial
      if (alive) setMarkers(next)
    }

    const publishEdgeRects = (rects: Record<string, Rect>) => {
      edgeLabelRectsRef.current = rects
      const root = canvas.closest('.graph-wrap') ?? document
      const spans = root.querySelectorAll<HTMLElement>('[data-testid="graph-edges"] [data-edge-id]')
      for (const span of spans) {
        const rect = rects[span.getAttribute('data-edge-id') ?? '']
        if (!rect) {
          span.removeAttribute('data-label-left')
          span.removeAttribute('data-label-top')
          span.removeAttribute('data-label-right')
          span.removeAttribute('data-label-bottom')
          continue
        }
        span.setAttribute('data-label-left', String(Math.round(rect.left)))
        span.setAttribute('data-label-top', String(Math.round(rect.top)))
        span.setAttribute('data-label-right', String(Math.round(rect.right)))
        span.setAttribute('data-label-bottom', String(Math.round(rect.bottom)))
      }
    }

    const draw = (shouldPublish: boolean) => {
      resize()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const colors = readPalette()
      const nodes = sim.nodes()
      const links = sim.force<ForceLink<SimNode, SimLink>>('link')?.links() ?? []
      const hiddenNow = hiddenRef.current
      const hover = hoverRef.id
      const current = selectedRef.current
      const highlight = highlightedIds()
      const labelFocus = new Set<string>()
      if (hover) labelFocus.add(hover)
      if (focusedRef.current) labelFocus.add(focusedRef.current)
      if (current) labelFocus.add(current)
      const edgeMode = edgeLabelMode(links.length, transform.k, modelMode)
      const settled = canvas.dataset.settled !== 'false'
      const labelNodes = nodes
        .filter((node) => !isLegendHidden(hiddenNow, node) && node.x != null && node.y != null)
        .map((node) => {
          const point = screenOf(node.x!, node.y!)
          return { x: point.x, y: point.y, radius: nodeRadius(node.kind, node.degree ?? 0) * transform.k }
        })
      const placedNodes: { node: SimNode; point: { x: number; y: number }; radius: number }[] = []
      for (const node of nodes) {
        if (isLegendHidden(hiddenNow, node) || node.x == null || node.y == null) continue
        placedNodes.push({
          node,
          point: screenOf(node.x, node.y),
          radius: nodeRadius(node.kind, node.degree ?? 0) * transform.k,
        })
      }
      // Node captions and edge labels share one collision pass: an edge label
      // that needs the space hides the caption beneath it below.
      context.font = '12px "Inter Variable", Inter, sans-serif'
      const labelCenters = new Map<string, number>()
      const labelPlacements = new Map<string, ReturnType<typeof placeNodeLabel>>()
      const captionBoxes: LabelBox[] = placedNodes.map(({ node, point, radius }) => {
        const textWidth = context.measureText(node.caption).width
        const centerX = clampLabelCenter(point.x, textWidth, canvas.clientWidth)
        labelCenters.set(node.id, centerX)
        const active = node.id === current || highlight.has(node.id)
        const placement = placeNodeLabel(
          point.y,
          radius,
          canvas.clientHeight,
          active && Boolean(node.subtitle) && transform.k >= 0.6,
        )
        labelPlacements.set(node.id, placement)
        return {
          id: node.id,
          priority: labelPriority(node.kind, active),
          kind: node.kind,
          left: centerX - textWidth / 2 - 4,
          right: centerX + textWidth / 2 + 4,
          top: placement.top,
          bottom: placement.bottom,
        }
      })
      // The fit reserved room for every caption it measured, so a hair-width
      // pane does not drop a name it clamped inside the frame.
      const labelPaneWidth = settledPaneWidthRef.current > 0 ? settledPaneWidthRef.current : canvas.clientWidth
      const labels = visibleCaptionIds(captionBoxes, transform.k, { paneWidth: labelPaneWidth })
      // These are the real measured extents for the current captions. A system
      // fit may only reserve their room after this signature is current.
      labelsDrawnRef.current = captionSignature(nodes)
      const graphRoot = canvas.closest('.graph-wrap') ?? document
      const drawnEdges = new Set<string>()
      const edgeRects: Record<string, Rect> = {}

      canvas.dataset.zoom = transform.k.toFixed(2)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      context.fillStyle = colors.bg
      context.fillRect(0, 0, width, height)
      context.lineJoin = 'round'
      context.lineCap = 'round'
      context.textAlign = 'center'
      context.textBaseline = 'middle'

      const geometryOf = (link: SimLink) => {
        const source = endNode(link.source)
        const target = endNode(link.target)
        if (!source || !target || source.x == null || source.y == null || target.x == null || target.y == null) return null
        if (isLegendHidden(hiddenNow, source) || isLegendHidden(hiddenNow, target)) return null
        const from = screenOf(source.x, source.y)
        const to = screenOf(target.x, target.y)
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const bend = bendOf(link.id, len)
        const control = { x: (from.x + to.x) / 2 + (-dy / len) * bend, y: (from.y + to.y) / 2 + (dx / len) * bend }
        const targetR = nodeRadius(target.kind, target.degree ?? 0) * transform.k
        const tip = pointAtDistance(from, control, to, targetR + 2, true)
        return { source, target, from, control, to, tip }
      }

      const paintLink = (
        link: SimLink,
        emphasized: boolean,
        geometry: NonNullable<ReturnType<typeof geometryOf>>,
      ) => {
        const { from, control, to, tip } = geometry
        context.save()
        context.globalAlpha = !hover || emphasized ? 0.95 : 0.12
        context.strokeStyle = emphasized ? colors.text2 : colors.border
        context.fillStyle = emphasized ? colors.text2 : colors.border
        context.lineWidth = emphasized ? 1.8 : 1.25
        context.beginPath()
        context.moveTo(from.x, from.y)
        context.quadraticCurveTo(control.x, control.y, to.x, to.y)
        context.stroke()
        const tangent = curveTangent(from, control, to, tip.t)
        arrow(context, tip.point.x, tip.point.y, Math.atan2(tangent.y, tangent.x))
        context.restore()
      }

      type LabelCandidate = {
        link: SimLink
        geometry: NonNullable<ReturnType<typeof geometryOf>>
        emphasized: boolean
        priority: number
        /** One label per relation type around the focused endpoint. */
        typeKey: string
      }
      const labelCandidates: LabelCandidate[] = []
      const considerLink = (link: SimLink, emphasized: boolean) => {
        const geometry = geometryOf(link)
        if (!geometry) return
        paintLink(link, emphasized, geometry)
        const sourceFocus = labelFocus.has(geometry.source.id)
        const targetFocus = labelFocus.has(geometry.target.id)
        const activeEndpoint = sourceFocus || targetFocus
        // A small graph names every relation at rest. On a dense graph only the
        // selected / hovered / focused node's edges are named, independent of
        // the camera zoom; collision below drops what cannot fit.
        const dragging = canvas.dataset.dragging === 'true'
        const showLabel = (settled || dragging) && (edgeMode === 'all' || activeEndpoint)
        if (showLabel) {
          labelCandidates.push({
            link,
            geometry,
            emphasized,
            priority: activeEndpoint ? 3 : 1,
            typeKey: activeEndpoint
              ? `${sourceFocus ? geometry.source.id : geometry.target.id}|${link.label}`
              : '',
          })
        }
      }

      for (const link of links) {
        const source = endId(link.source)
        const target = endId(link.target)
        if (hover && (highlight.has(source) || highlight.has(target))) continue
        considerLink(link, false)
      }
      if (hover) {
        for (const link of links) {
          const source = endId(link.source)
          const target = endId(link.target)
          if (highlight.has(source) || highlight.has(target)) considerLink(link, true)
        }
      }

      const placedEdgeLabels: EdgeLabelBox[] = []
      const placedLabelTypes = new Set<string>()
      // Captions that are visible at rest are obstacles for an edge label, so a
      // selected or hovered edge moves aside instead of covering text.
      const captionObstacles: EdgeLabelBox[] = captionBoxes
        .filter((box) => labels.has(box.id))
        .map((box) => ({ x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top }))
      // An active edge label may use a hidden value chip's space, but it moves
      // aside from a shown object/type/active name when a legal slot exists.
      // It is never dropped for a name: if every slot covers one, the label is
      // still painted and `visibleCaptionIds` hides that caption below (K5).
      const namedCaptionObstacles: EdgeLabelBox[] = captionBoxes
        .filter((box) => labels.has(box.id) && box.priority >= NAMED_CAPTION_PRIORITY)
        .map((box) => ({ x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top }))
      context.font = '11px "Inter Variable", Inter, sans-serif'
      labelCandidates
        .slice()
        .sort((left, right) => right.priority - left.priority || left.link.id.localeCompare(right.link.id))
        .forEach((candidate) => {
          const { link, geometry, emphasized, typeKey } = candidate
          if (typeKey && placedLabelTypes.has(typeKey)) return
          const activeEndpoint = candidate.priority > 1
          const widthText = context.measureText(link.label).width
          const boxW = widthText + 12
          const boxH = 16
          // A selected or hovered label wins space from a hidden value chip,
          // but it still prefers a slot beside a shown object/type/active name.
          // If that aside slot hits a node or another label, retry without the
          // name obstacles (the a7a9792 path): the label is painted and the
          // covered caption hides in `visibleCaptionIds` (K5). Only stacking on
          // another painted edge label can still drop it.
          const placement = placeEdgeLabelWithFallback({
            from: geometry.from,
            control: geometry.control,
            to: geometry.to,
            size: { width: boxW, height: boxH },
            nodes: labelNodes,
            placed: placedEdgeLabels,
            preferred: activeEndpoint ? namedCaptionObstacles : captionObstacles,
            fallback: [],
            active: activeEndpoint,
          })
          if (placement.dropped) return
          const mid = placement.point
          const box = placement.box
          if (typeKey) placedLabelTypes.add(typeKey)
          placedEdgeLabels.push(box)
          drawnEdges.add(link.id)
          const rect = canvas.getBoundingClientRect()
          edgeRects[link.id] = {
            left: rect.left + box.x,
            top: rect.top + box.y,
            right: rect.left + box.x + box.width,
            bottom: rect.top + box.y + box.height,
          }
          context.save()
          context.globalAlpha = !hover || emphasized ? 1 : 0.16
          context.fillStyle = colors.raised
          context.strokeStyle = colors.border
          context.lineWidth = 1
          roundRect(context, box.x, box.y, box.width, box.height, 8)
          context.fill()
          context.stroke()
          context.fillStyle = colors.text2
          context.fillText(link.label, mid.x, mid.y + 0.5)
          context.restore()
        })
      // Edge labels win the space they need; a caption that would sit under one
      // is hidden instead of stacking on top of it.
      const shownCaptionIds = visibleCaptionIds(captionBoxes, transform.k, {
        paneWidth: width,
        edgeLabels: placedEdgeLabels.map((box) => ({
          left: box.x,
          top: box.y,
          right: box.x + box.width,
          bottom: box.y + box.height,
        })),
      })

      for (const { node, point, radius } of placedNodes) {
        const emphasized = !hover || highlight.has(node.id)
        const fill = colors.fill[node.kind]
        context.save()
        context.globalAlpha = emphasized ? 1 : 0.14
        context.beginPath()
        context.arc(point.x, point.y, radius, 0, Math.PI * 2)
        context.fillStyle = fill
        context.fill()
        context.lineWidth = node.id === current ? 3 : hover === node.id ? 2 : 2
        context.strokeStyle = node.id === current || hover === node.id ? colors.text : colors.bg
        context.stroke()
        const mark = nodeMark(node.caption)
        if (mark && radius >= 10) {
          context.fillStyle = ink(fill, colors.text, colors.bg)
          context.font = `600 ${Math.max(11, Math.min(15, radius * 0.46))}px "Inter Variable", Inter, sans-serif`
          context.fillText(mark, point.x, point.y)
        }
        context.restore()
      }

      context.font = '12px "Inter Variable", Inter, sans-serif'
      for (const { node, point } of placedNodes) {
        if (!shownCaptionIds.has(node.id) || !node.caption) continue
        const emphasized = !hover || highlight.has(node.id)
        const active = node.id === current || highlight.has(node.id)
        const centerX = labelCenters.get(node.id) ?? point.x
        const placement = labelPlacements.get(node.id)
        if (!placement) continue
        context.save()
        context.globalAlpha = emphasized ? 1 : 0.28
        haloText(context, node.caption, centerX, placement.captionY, colors.text, colors.bg)
        if (active && node.subtitle && transform.k >= 0.6) {
          context.font = '10px "Inter Variable", Inter, sans-serif'
          const subtitleWidth = context.measureText(node.subtitle).width
          const subtitleX = clampLabelCenter(point.x, subtitleWidth, canvas.clientWidth)
          context.lineWidth = 3
          context.strokeStyle = colors.bg
          context.strokeText(node.subtitle, subtitleX, placement.subtitleY)
          context.fillStyle = colors.muted
          context.fillText(node.subtitle, subtitleX, placement.subtitleY)
        }
        context.restore()
      }

      if (shouldPublish) {
        const placedIds = new Set(placedNodes.map(({ node }) => node.id))
        // Clear stale `true` flags too: a node that leaves the placed set (or
        // was hidden) must not keep advertising an old caption box.
        for (const button of graphRoot.querySelectorAll<HTMLElement>('[data-node-id]')) {
          const id = button.getAttribute('data-node-id') ?? ''
          button.setAttribute(
            'data-label-shown',
            placedIds.has(id) && shownCaptionIds.has(id) ? 'true' : 'false',
          )
        }
        publishEdgeRects(edgeRects)
        const edgeSerial = [...drawnEdges].sort().join('|')
        if (edgeSerial !== shownEdgesRef.current) {
          shownEdgesRef.current = edgeSerial
          if (alive) setShownEdges(drawnEdges)
        }
        publish(shownCaptionIds)
      }
    }

    const fit = () => {
      resize()
      const simById = new Map(
        sim
          .nodes()
          .filter((node) => node.x != null && node.y != null)
          .map((node) => [node.id, node]),
      )
      const layoutNodes = placedRef.current.nodes.filter((node) => !isLegendHidden(hiddenRef.current, node))
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!layoutNodes.length || width < 20 || height < 20) return false
      context.save()
      context.font = '12px "Inter Variable", Inter, sans-serif'
      const captionWidthForScene = (node: SceneNode) => {
        if (node.objectId) {
          const name = knownRef.current[node.objectId]?.name
          if (name) return context.measureText(name).width
        }
        return context.measureText(node.caption).width
      }
      const extents = layoutNodes
        .map((sceneNode) => {
          const simNode = simById.get(sceneNode.id)
          if (!simNode || simNode.x == null || simNode.y == null) return null
          return {
            x: simNode.x,
            y: simNode.y,
            radius: nodeRadius(sceneNode.kind, simNode.degree ?? 0),
            captionWidth: captionWidthForScene(sceneNode),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item != null)
      if (!initialSettledRef.current) {
        extents.push(
          ...pendingPeerFitExtents(sceneRef.current, focusKeyRef.current, sim.nodes(), captionWidthForScene),
        )
      }
      context.restore()
      const frame = currentFrame()
      // Do not claim the chrome is measured while the open bottom sheet has no
      // box yet; that taller frame must not freeze the initial-load baseline.
      if (
        chromeMeasureReady(
          placementRef.current,
          measureChromeBox(canvas, inspectorRef.current),
          bottomCardOpen(),
          densityRef.current === 'wide' && Boolean(selectedRef.current) && propertiesOpen(densityRef.current, sheetRef.current),
        )
      ) {
        chromeMeasuredRef.current = true
      }
      // A narrow pane with long article captions can need less than the old
      // 0.35 floor to keep the measured labels inside the frame.
      const camera = fitCameraWithLabels({ frame, nodes: extents, minScale: 0.1 })
      if (!camera) return false
      transform.k = camera.k
      transform.x = camera.x
      transform.y = camera.y
      lastFrame = frame
      draw(true)
      scheduleInitialSettle()
      return true
    }

    const relayout = () => {
      const nodes = sim.nodes()
      nodes.forEach((node, index) => {
        node.fx = null
        node.fy = null
        const pos = seed(node.kind, index, nodes.length)
        node.x = pos.x
        node.y = pos.y
        node.vx = 0
        node.vy = 0
      })
      movedRef.current = false
      fitAfterRef.current = true
      canvas.dataset.settled = 'false'
      canvas.dataset.settling = 'true'
      sim.alpha(1).restart()
      pinRef.current((tick) => tick + 1)
    }

    apiRef.current = {
      fit,
      remap,
      relayout,
      refocus: () => {
        movedRef.current = false
        fitAfterRef.current = true
      },
      markerOf: (id: string) => {
        const node = sim.nodes().find((item) => item.id === id)
        if (!node || node.x == null || node.y == null) return undefined
        const point = screenOf(node.x, node.y)
        const rect = canvas.getBoundingClientRect()
        return {
          x: rect.left + point.x,
          y: rect.top + point.y,
          r: Math.round(nodeRadius(node.kind, node.degree ?? 0) * transform.k),
        }
      },
    }
    drawRef.current = draw

    sim.on('tick', () => {
      if (alive) draw(false)
    })
    sim.on('end', () => {
      canvas.dataset.settling = 'false'
      if (!alive || sim.nodes().length === 0) return
      sim.alphaTarget(0)
      canvas.dataset.settled = 'true'
      initialEndedRef.current = true
      draw(true)
      if (fitAfterRef.current) {
        // Event A: first complete measurement of this load. requestSystemFit
        // waits for resolved names and a complete free frame; the sheet box or
        // a late caption may request the next attempt.
        fitAfterRef.current = false
        if (deferInitialFitForSheet(densityRef.current, selectedRef.current, sheetRef.current, placementRef.current)) {
          if (placementRef.current === 'sheet') requestSystemFitRef.current('sheet')
        } else {
          requestSystemFitRef.current(initialSettledRef.current ? 'resize' : 'initial')
        }
      }
      scheduleInitialSettle()
      sim.stop()
    })

    let mode: 'none' | 'pan' | 'node' = 'none'
    let dragNode: SimNode | undefined
    let lastX = 0
    let lastY = 0
    let startX = 0
    let startY = 0
    let dragged = false

    const onPointerDown = (event: PointerEvent) => {
      // Right-click opens the context menu; it must not select, drag or refit the graph.
      if (event.button !== 0) return
      // A fresh pointer interaction owns focus again (a menu ring may linger
      // after Esc until then).
      menuFocusRef.current = ''
      canvas.focus()
      const hit = hitTest(event.offsetX, event.offsetY)
      lastX = event.offsetX
      lastY = event.offsetY
      startX = event.offsetX
      startY = event.offsetY
      dragged = false
      if (hit) {
        // A plain click must not wake the simulation: pin only once the pointer
        // actually travels, so selecting a node never moves the hub.
        mode = 'node'
        dragNode = hit
      } else {
        mode = 'pan'
        setFocused('')
        canvas.classList.add('panning')
      }
      if (typeof event.pointerId === 'number') canvas.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      const hit = hitTest(event.offsetX, event.offsetY)
      const nextHover = hit?.id ?? ''
      if (hoverRef.id !== nextHover) {
        hoverRef.id = nextHover
        canvas.style.cursor = nextHover ? 'pointer' : mode === 'pan' ? 'grabbing' : 'grab'
        draw(true)
      }
      if (mode === 'none') return
      const dx = event.offsetX - lastX
      const dy = event.offsetY - lastY
      lastX = event.offsetX
      lastY = event.offsetY
      if (Math.hypot(event.offsetX - startX, event.offsetY - startY) > 3) dragged = true
      if (mode === 'pan') {
        transform.x += dx
        transform.y += dy
        movedRef.current = true
        fitAfterRef.current = false
        draw(false)
      } else if (dragNode && dragNode.x != null && dragNode.y != null) {
        if (!dragged) return
        if (dragNode.fx == null || dragNode.fy == null) {
          dragNode.fx = dragNode.x
          dragNode.fy = dragNode.y
          // The node is being moved: labels redraw with it, and the layout is
          // not settled again until the released node comes to rest.
          canvas.dataset.dragging = 'true'
          canvas.dataset.settling = 'true'
          sim.alphaTarget(0.25).restart()
        }
        dragNode.fx = (dragNode.fx ?? dragNode.x) + dx / transform.k
        dragNode.fy = (dragNode.fy ?? dragNode.y) + dy / transform.k
        movedRef.current = true
        draw(false)
      }
    }
    const onPointerUp = (event: PointerEvent) => {
      if (mode === 'node') canvas.dataset.dragging = 'false'
      if (mode === 'node' && dragNode) {
        const travel = Math.hypot(event.offsetX - startX, event.offsetY - startY)
        const wasPinned = dragNode.fx != null && dragNode.fy != null
        // A click keeps an existing pin; only Unpin or Re-layout releases it.
        if (!staysPinnedAfterPointerUp(wasPinned, dragged, modelMode)) {
          dragNode.fx = null
          dragNode.fy = null
        }
        selectRef.current(dragNode.id)
        // A plain click is also the keyboard focus: the next Shift+F10 must
        // open this node's menu, not the last node reached with Tab. A drag is
        // not a click: it keeps the camera and the label set as they were.
        if (travel <= 3) focusNodeButton(dragNode.id, canvas)
        sim.alphaTarget(0)
        if (!modelMode) pinRef.current((tick) => tick + 1)
        draw(true)
      }
      mode = 'none'
      dragNode = undefined
      canvas.classList.remove('panning')
      if (typeof event.pointerId === 'number' && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    const onPointerLeave = () => {
      if (mode !== 'none') return
      if (!hoverRef.id) return
      hoverRef.id = ''
      canvas.style.cursor = 'grab'
      draw(true)
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const prev = transform.k
      const next = Math.min(2.5, Math.max(0.25, prev * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))
      const wx = (event.offsetX - transform.x) / prev
      const wy = (event.offsetY - transform.y) / prev
      transform.k = next
      transform.x = event.offsetX - wx * next
      transform.y = event.offsetY - wy * next
      movedRef.current = true
      fitAfterRef.current = false
      draw(true)
    }
    const onDouble = (event: MouseEvent) => {
      if (dragged) return
      const point = localPoint(event)
      const hit = hitTest(point.x, point.y)
      if (!hit) return
      selectRef.current(hit.id)
      expandRef.current(hit)
    }
    // The a11y node buttons are off-screen, so a real right-click lands on the
    // canvas. Hit-test it and open the same node menu the buttons open.
    const onContextMenu = (event: MouseEvent) => {
      if (prefersNativeContextMenu(event.target)) return
      // Never let Chrome own the graph surface. A node gets its own menu;
      // empty canvas gets Fit / Re-layout or nothing, but never the native one.
      event.preventDefault()
      const point = localPoint(event)
      const hit = hitTest(point.x, point.y)
      const stage = stageRect()
      if (!hit || !canOpenGraphNodeMenu(hit)) {
        canvas.focus({ preventScroll: true })
        openGraphCanvasMenu(event.clientX, event.clientY, stage)
        return
      }
      // Anchor on the live node position at event time, not a published marker.
      const rect = canvas.getBoundingClientRect()
      const screen = screenOf(hit.x ?? 0, hit.y ?? 0)
      const radius = nodeRadius(hit.kind, hit.degree ?? 0) * transform.k
      const marker = { x: rect.left + screen.x, y: rect.top + screen.y, r: radius }
      // The circle + caption union is the node's edge: the menu stays outside
      // the text too, and the dialog anchor uses the same rect.
      const avoid = nodeMenuAvoid(marker, hit.caption)
      const anchor = avoid
        ? { x: avoid.right, y: avoid.top }
        : nodeMenuAnchor(marker, { x: event.clientX, y: event.clientY })
      const obstacles = [
        ...nodeObstacles({
          ...markersRef.current,
          [hit.id]: { ...marker, label: avoid ? { ...avoid } : undefined },
        }),
        ...Object.values(edgeLabelRectsRef.current),
      ]
      menuFocusRef.current = hit.id
      focusNodeButton(hit.id, canvas)
      openGraphNodeMenu(
        hit,
        defsRef.current,
        anchor.x,
        anchor.y,
        openAddLink,
        avoid,
        stage,
        obstacles,
        stage,
        avoid,
        () => expandRef.current(hit),
      )
    }

    let sawPointer = 0
    const pointerRecent = () => performance.now() - sawPointer < 80
    const rememberPointer = () => {
      sawPointer = performance.now()
    }
    const onMouseDown = (event: MouseEvent) => {
      if (pointerRecent()) return
      onPointerDown(event as PointerEvent)
    }
    const onMouseMove = (event: MouseEvent) => {
      if (pointerRecent()) return
      onPointerMove(event as PointerEvent)
    }
    const onMouseUp = (event: MouseEvent) => {
      if (pointerRecent()) return
      onPointerUp(event as PointerEvent)
    }
    const onPointerDownWrapped = (event: PointerEvent) => {
      rememberPointer()
      onPointerDown(event)
    }
    const onPointerMoveWrapped = (event: PointerEvent) => {
      rememberPointer()
      onPointerMove(event)
    }
    const onPointerUpWrapped = (event: PointerEvent) => {
      rememberPointer()
      onPointerUp(event)
    }
    canvas.addEventListener('pointerdown', onPointerDownWrapped)
    canvas.addEventListener('pointermove', onPointerMoveWrapped)
    canvas.addEventListener('pointerup', onPointerUpWrapped)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('dblclick', onDouble)
    canvas.addEventListener('contextmenu', onContextMenu)
    // Event C: a *real* pane/canvas resize. The observer's first delivery is
    // the size we already have; the system fit is gated on the settled pane and
    // the open sheet box, so a mid-transition size cannot be fitted as final.
    // Once the user has zoomed or panned, the camera belongs to them: remap the
    // same world view into the new free frame instead of reusing old pixels.
    let observedWidth = canvas.clientWidth
    let observedHeight = canvas.clientHeight
    const observer = new ResizeObserver(() => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const changed = width !== observedWidth || height !== observedHeight
      observedWidth = width
      observedHeight = height
      if (changed && canvas.dataset.dragging !== 'true') {
        requestSystemFitRef.current('resize')
      }
      // Publish the new client rects too: the a11y nodes and menu anchors must
      // follow the resized canvas.
      draw(true)
    })
    observer.observe(canvas)
    const theme = new MutationObserver(() => {
      paletteRef.current = null
      draw(false)
    })
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    draw(false)

    return () => {
      alive = false
      if (settleTimer !== undefined) clearTimeout(settleTimer)
      sim.on('tick', null)
      sim.on('end', null)
      sim.stop()
      observer.disconnect()
      theme.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDownWrapped)
      canvas.removeEventListener('pointermove', onPointerMoveWrapped)
      canvas.removeEventListener('pointerup', onPointerUpWrapped)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDouble)
      canvas.removeEventListener('contextmenu', onContextMenu)
      if (simRef.current === sim) simRef.current = null
    }
  }, [])

  const layoutFocus = useRef('')
  useEffect(() => {
    const sim = simRef.current
    const canvas = canvasRef.current
    if (!sim || !canvas) return
    const reuse = layoutFocus.current === focusId
    layoutFocus.current = focusId
    if (!reuse) {
      // A new focus object starts a new load: allow idle refits again until its
      // own nodes, captions and chrome have settled.
      apiRef.current.refocus()
      initialSettledRef.current = false
      initialEndedRef.current = false
      chromeMeasuredRef.current = false
      idleIdsRef.current = null
      idleCaptionsRef.current = ''
      paneSettleRef.current.cancel()
      const stage = stageRef.current
      if (stage) paneSettleRef.current.observe(stage.clientWidth, stage.clientHeight)
    }
    const tally = new Map<string, number>()
    for (const edge of placed.edges) {
      tally.set(edge.source, (tally.get(edge.source) ?? 0) + 1)
      tally.set(edge.target, (tally.get(edge.target) ?? 0) + 1)
    }
    const previous = reuse ? new Map(sim.nodes().map((node) => [node.id, node])) : new Map<string, SimNode>()
    let captionsChanged = false
    const next: SimNode[] = placed.nodes.map((node, index) => {
      const degree = tally.get(node.id) ?? 0
      const old = previous.get(node.id)
      if (!old) {
        // A new node joins beside the neighbour it was linked to, so the rest of
        // the graph does not jump to make room.
        const edge = placed.edges.find(
          (item) =>
            (item.source === node.id && previous.has(item.target)) ||
            (item.target === node.id && previous.has(item.source)),
        )
        const neighbourId = edge ? (edge.source === node.id ? edge.target : edge.source) : ''
        const neighbour = previous.get(neighbourId)
        let pos = seed(node.kind, index, placed.nodes.length)
        if (neighbour && neighbour.x != null && neighbour.y != null) {
          const angle = (index / Math.max(1, placed.nodes.length)) * Math.PI * 2
          const distance = 72 + nodeRadius(node.kind, degree) + nodeRadius(neighbour.kind, neighbour.degree ?? 0)
          pos = { x: neighbour.x + Math.cos(angle) * distance, y: neighbour.y + Math.sin(angle) * distance }
        }
        return { ...node, degree, x: pos.x, y: pos.y, vx: 0, vy: 0 }
      }
      if (old.caption !== node.caption || old.degree !== degree) captionsChanged = true
      old.kind = node.kind
      old.caption = node.caption
      old.subtitle = node.subtitle
      old.rawCaption = node.rawCaption
      old.objectId = node.objectId
      old.typeKey = node.typeKey
      old.typeName = node.typeName
      old.properties = node.properties
      old.degree = degree
      return old
    })
    const links: SimLink[] = placed.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
    }))
    const oldNodes = sim.nodes()
    const sameNodes = reuse && oldNodes.length === next.length && next.every((node, index) => oldNodes[index]?.id === node.id)
    const previousLinks = sim.force<ForceLink<SimNode, SimLink>>('link')?.links() ?? []
    const sameLinks = previousLinks.length === links.length && links.every((link, index) => previousLinks[index]?.id === link.id)
    const addedCount = next.filter((node) => !previous.has(node.id)).length
    if (!sameNodes) sim.nodes(next)
    if (!sameLinks) sim.force<ForceLink<SimNode, SimLink>>('link')?.links(links)
    if (!sameNodes || !sameLinks || captionsChanged) {
      const cold = previous.size === 0
      if (cold) {
        canvas.dataset.settled = 'false'
        canvas.dataset.settling = 'true'
        sim.alpha(1).restart()
      } else if (addedCount > 0) {
        // Keep every settled node where it is; only the new arrivals were
        // seeded, beside the neighbour they came from. No force pass may move
        // the rest of the graph.
        for (const node of next) {
          node.vx = 0
          node.vy = 0
        }
        drawRef.current(true)
        if (fitAfterRef.current) {
          fitAfterRef.current = false
          requestSystemFitRef.current(initialSettledRef.current ? 'resize' : 'initial')
        } else if (!movedRef.current && !initialSettledRef.current) {
          requestSystemFitRef.current('initial')
        }
      } else {
        // A link or name changed without adding nodes: redraw, never re-layout.
        for (const node of next) {
          node.vx = 0
          node.vy = 0
        }
        drawRef.current(true)
        if (!movedRef.current && captionsChanged && !initialSettledRef.current) {
          requestSystemFitRef.current('initial')
        }
      }
    } else drawRef.current(true)
  }, [placed, focusId])

  useEffect(() => {
    drawRef.current(true)
  }, [selected, hidden, focused])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const gate = paneSettleRef.current
    const apply = (width: number, height: number) => {
      const next = { width: Math.floor(width), height: Math.floor(height) }
      gate.observe(width, height)
      setPane((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next))
    }
    apply(stage.clientWidth, stage.clientHeight)
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      apply(rect?.width ?? stage.clientWidth, rect?.height ?? stage.clientHeight)
    })
    observer.observe(stage)
    return () => {
      observer.disconnect()
      gate.cancel()
    }
  }, [])

  useEffect(() => {
    // Nodes and captions that resolve after the first paint (a reload, F5)
    // still get an idle refit while the initial load settles. After that the
    // id baseline is frozen so add-link / expand growth never idle-fits, even
    // when the new node's caption arrives later.
    const ids = scene.nodes
      .map((node) => node.id)
      .sort()
      .join('|')
    const captions = scene.nodes
      .map((node) => `${node.id}\u0000${node.caption}\u0000${node.subtitle}`)
      .join('|')
    const previousCaptions = idleCaptionsRef.current
    idleCaptionsRef.current = captions
    currentIdsRef.current = ids
    const plan = idleRefitPlan({
      settled: initialSettledRef.current,
      baselineIds: idleIdsRef.current,
      ids,
      captions,
      previousCaptions,
      moved: movedRef.current,
    })
    idleIdsRef.current = plan.baselineIds
    if (plan.fit) requestSystemFitRef.current('initial')
  }, [scene])

  const selectedNode = scene.nodes.find((node) => node.id === selected) ?? null
  const density: GraphDensity = pane == null ? 'wide' : graphDensity(pane.width)
  densityRef.current = density
  settledPaneWidthRef.current = pane?.width ?? 0
  const placement = detailPlacement(density, sheet, Boolean(selectedNode))
  placementRef.current = placement
  const showProperties = propertiesOpen(density, sheet)
  const chrome = inspectorChrome(placement, pane?.height ?? 0)

  const chromeKeyRef = useRef('')
  const previousPaneRef = useRef<{ width: number; height: number } | null>(null)
  const lastFullRef = useRef(full)
  const paneRef = useRef(pane)
  paneRef.current = pane

  // The only place a system fit is decided. Every path below requests an
  // explicit event; this re-reads the live pane, sheet, full-size and user
  // camera state when the scheduled pass runs, so a mid-transition size or a
  // sheet-less frame simply no-ops and waits for the next event.
  runSystemFitRef.current = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const currentPane = paneRef.current
    const paneReady = Boolean(
      currentPane &&
        Math.abs(canvas.clientWidth - currentPane.width) <= 1 &&
        Math.abs(canvas.clientHeight - currentPane.height) <= 1,
    )
    const sim = simRef.current
    const sheetExpected =
      placementRef.current === 'sheet' ||
      bottomCardOpenAt(densityRef.current, selectedRef.current, sheetRef.current, placementRef.current)
    const sideOpen =
      densityRef.current === 'wide' &&
      Boolean(selectedRef.current) &&
      propertiesOpen(densityRef.current, sheetRef.current)
    const layoutReady = () => {
      const layout = placedRef.current.nodes
      const simNodes = sim?.nodes() ?? []
      const simIds = new Set(simNodes.map((node) => node.id))
      return layout.length === simNodes.length && layout.every((node) => simIds.has(node.id))
    }
    const action = requestSystemFit({
      event,
      placement: placementRef.current,
      inspector: measureChromeBox(canvas, inspectorRef.current),
      bottomCardOpen: bottomCardOpenAt(
        densityRef.current,
        selectedRef.current,
        sheetRef.current,
        placementRef.current,
      ),
      sideCardOpen: sideOpen,
      labelsReady: sim ? fontsReady() && labelsDrawnRef.current === captionSignature(sim.nodes()) : false,
      sheetStable: !sheetExpected || sheetStableRef.current,
      paneSettled: paneSettleRef.current.settled,
      paneReady,
      moved: movedRef.current,
      baselineFrozen: initialSettledRef.current,
      loadEnded: initialEndedRef.current,
      namesPending:
        pendingNamesRef.current !== '' ||
        sceneRef.current.nodes.some((node) => node.kind === 'object' && node.rawCaption) ||
        !layoutReady(),
    })
    if (action === 'none') return
    if (action === 'remap') apiRef.current.remap()
    else apiRef.current.fit()
  }
  requestSystemFitRef.current = (event) => {
    // The settled bottom-sheet box and narrow full-size toggle must fit on the
    // same turn; the debounced scheduler can be too late for Playwright.
    const narrowSheet = deferInitialFitForSheet(
      densityRef.current,
      selectedRef.current,
      sheetRef.current,
      placementRef.current,
    )
    if (event === 'sheet' || (event === 'fullscreen' && narrowSheet)) {
      runSystemFitRef.current(event)
      return
    }
    fitSchedulerRef.current?.request(event)
  }
  useEffect(() => () => fitSchedulerRef.current?.cancel(), [])

  useEffect(() => {
    // A caption measured before its web font finished loading is not a final
    // label box. Retry the first-load fit once the font set is ready, unless
    // the user already owns the camera or the load has settled.
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    if (!fonts) return
    let cancelled = false
    void fonts.ready.then(() => {
      if (cancelled || movedRef.current || initialSettledRef.current) return
      if (deferInitialFitForSheet(densityRef.current, selectedRef.current, sheetRef.current, placementRef.current)) {
        if (placementRef.current === 'sheet') requestSystemFitRef.current('sheet')
        return
      }
      requestSystemFitRef.current('initial')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // The first pane measurement is event A's frame; every later size is a real
    // pane resize (event C). The system fit re-checks that the canvas still
    // matches the pane, so a resize during Close full size cannot fit a
    // leftover full-size canvas as if it were final.
    const previous = previousPaneRef.current
    previousPaneRef.current = pane ? { width: pane.width, height: pane.height } : null
    if (!pane) return
    if (previous && previous.width === pane.width && previous.height === pane.height) return
    if (!previous) {
      if (
        !deferInitialFitForSheet(densityRef.current, selectedRef.current, sheetRef.current, placementRef.current)
      ) {
        requestSystemFitRef.current('initial')
      }
      return
    }
    requestSystemFitRef.current('resize')
  }, [pane])

  useEffect(() => {
    // Event B: fullscreen open or close. The pane effect (C) and the first-sheet
    // observer (D) may supply the complete frame after this; requesting B on
    // mount would be a phantom toggle, so skip it.
    if (lastFullRef.current === full) return
    lastFullRef.current = full
    requestSystemFitRef.current('fullscreen')
  }, [full])

  useEffect(() => {
    // Event D: a bottom sheet is an overlay, so it appears without resizing the
    // canvas. The observer may only catch the first *settled* box for this
    // placement/pane key; after that, inspector growth (add-link, expand, a
    // late name) is content and must never refit an untouched camera. A side
    // card is never observed.
    const key = `${placement}:${pane?.width ?? 0}x${pane?.height ?? 0}`
    const previous = chromeKeyRef.current
    const changed = previous !== key
    chromeKeyRef.current = key

    let observer: ResizeObserver | undefined
    let quietFrame: number | null = null
    let quietTimer: ReturnType<typeof setTimeout> | undefined
    const clearQuiet = () => {
      if (quietFrame !== null) {
        cancelAnimationFrame(quietFrame)
        quietFrame = null
      }
      if (quietTimer !== undefined) {
        clearTimeout(quietTimer)
        quietTimer = undefined
      }
    }

    if (placement === 'sheet') {
      // A fresh sheet key starts unmeasured: do not gate a later fit on a
      // previous stable box, and wait for this sheet to settle. The `sheet`
      // request below is scheduled async, so it reads the reset flag.
      sheetStableRef.current = false
      // The first box is only the settled sheet once the load's names and
      // captions are ready: a late name reflow can pass through a short quiet
      // window between two otherwise identical layouts. Only then may the box
      // hold still for the longer quiet window and freeze the free frame.
      const namesReady = () => {
        const simNodes = simRef.current?.nodes() ?? []
        const layout = placedRef.current.nodes
        const simIds = new Set(simNodes.map((node) => node.id))
        const layoutReady =
          layout.length === simNodes.length && layout.every((node) => simIds.has(node.id))
        return (
          pendingNamesRef.current === '' &&
          !sceneRef.current.nodes.some((node) => node.kind === 'object' && node.rawCaption) &&
          layoutReady &&
          fontsReady() &&
          labelsDrawnRef.current === captionSignature(simNodes)
        )
      }
      let candidate: Box | null = null
      const arm = () => {
        quietTimer = setTimeout(() => {
          quietTimer = undefined
          const next = canvasRef.current
          if (!next || sheetStableRef.current) return
          if (!namesReady()) {
            // Names are still resolving or the current captions have not been
            // measured: the card can still grow. Re-check rather than accept a
            // box that is about to reflow. A later resize cancels this timer.
            arm()
            return
          }
          const now = measureChromeBox(next, inspectorRef.current)
          if (chromeSheetBoxSettled({ previous: candidate, current: now, quiet: true, namesReady: true })) {
            sheetStableRef.current = true
            requestSystemFitRef.current('sheet')
            observer?.disconnect()
          }
        }, SHEET_QUIET_MS)
      }
      observer = new ResizeObserver(() => {
        const canvas = canvasRef.current
        if (!canvas || sheetStableRef.current) return
        const box = measureChromeBox(canvas, inspectorRef.current)
        if (!box) return
        candidate = box
        clearQuiet()
        // Wait a frame or two: if the box is unchanged when the quiet window
        // ends it is the settled sheet, not a mid-transition height.
        quietFrame = requestAnimationFrame(() => {
          quietFrame = null
          arm()
        })
      })
      for (const element of [inspectorRef.current, legendRef.current]) {
        if (element) observer.observe(element)
      }
    } else if (
      bottomCardOpenAt(densityRef.current, selectedRef.current, sheetRef.current, placement)
    ) {
      sheetStableRef.current = false
    } else {
      sheetStableRef.current = true
    }

    if (changed && pane && placement !== 'hidden') {
      if (placement === 'sheet') requestSystemFitRef.current('sheet')
      else if (previous !== '') requestSystemFitRef.current('resize')
    }
    return () => {
      clearQuiet()
      observer?.disconnect()
    }
  }, [placement, pane])
  const pinned = Boolean(
    pinTick >= 0 && simRef.current?.nodes().some((node) => node.id === selected && node.fx != null && node.fy != null),
  )
  const shown = placed.nodes.filter((node) => !isLegendHidden(hidden, node))
  const shownFocus = focused || menuFocusRef.current
  const focusedNode = shownFocus ? shown.find((node) => node.id === shownFocus) : undefined
  const focusMarker = focusedNode ? markers[focusedNode.id] : undefined
  const canvasBox = focusMarker ? canvasRef.current?.getBoundingClientRect() : undefined
  const focusRing = focusMarker && canvasBox
    ? {
        left: focusMarker.x - canvasBox.left,
        top: focusMarker.y - canvasBox.top,
        size: 2 * (focusMarker.r + 4),
      }
    : undefined

  const revealSheet = () => setSheet((mode) => (mode === 'dismissed' || mode === 'chip' ? 'compact' : mode))

  const stageRect = (): Rect | undefined => {
    const rect = stageRef.current?.getBoundingClientRect()
    return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : undefined
  }
  const openGraphCanvasMenu = (x: number, y: number, stage: Rect | undefined) => {
    registerCommandRunner('graph:canvas:fit', () => apiRef.current.fit())
    registerCommandRunner('graph:canvas:relayout', () => apiRef.current.relayout())
    openSharedContextMenu({
      context: 'graph-node',
      x,
      y,
      extraOnly: true,
      extra: [
        { id: 'graph:canvas:fit', title: copy.fitGraph, contexts: ['graph-node'], group: 'object', palette: false },
        { id: 'graph:canvas:relayout', title: copy.relayout, contexts: ['graph-node'], group: 'object', palette: false },
      ],
      ...(stage ? { bounds: stage } : {}),
    })
  }
  const openMenuForNode = (node: SceneNode) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const fallback = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 8, y: 8 }
    // Use the live simulation position so a keyboard menu opens beside the node
    // even when the last published marker is a frame behind.
    const stored = markers[node.id]
    const live = apiRef.current.markerOf(node.id)
    const marker = live
      ? {
          ...live,
          ...(stored && Math.abs(stored.x - live.x) <= 2 && Math.abs(stored.y - live.y) <= 2 ? { label: stored.label } : {}),
        }
      : stored
    // The circle + caption union is the node's edge; see the pointer path.
    const avoid = nodeMenuAvoid(marker, node.caption)
    const anchor = avoid ? { x: avoid.right, y: avoid.top } : nodeMenuAnchor(marker, fallback)
    const radius = marker?.r ?? 0
    const obstacles = [
      ...nodeObstacles(
        marker
          ? { ...markers, [node.id]: { x: marker.x, y: marker.y, r: radius, label: avoid } }
          : markers,
      ),
      ...Object.values(edgeLabelRectsRef.current),
    ]
    // A mouse-opened menu must leave a visible focus ring after Esc.
    menuFocusRef.current = node.id
    const button = stageRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(node.id)}"]`)
    button?.focus({ preventScroll: true })
    const stage = stageRect()
    openGraphNodeMenu(
      node,
      defsRef.current,
      anchor.x,
      anchor.y,
      openAddLink,
      avoid,
      stage,
      obstacles,
      stage,
      avoid,
      () => expandRef.current(node),
    )
  }
  const opensNodeMenu = (event: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) =>
    ((event.ctrlKey || event.metaKey) && event.key === 'Enter') ||
    (event.shiftKey === true && event.key === 'F10') ||
    event.key === 'ContextMenu'

  const onKey = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Escape') {
      if (density === 'narrow' && sheet !== 'dismissed' && selected) {
        setSheet('dismissed')
        return
      }
      setSelected('')
      return
    }
    if (opensNodeMenu(event)) {
      // Never let the browser open its native menu on the graph surface. With a
      // usable selected node our menu opens; otherwise the key does nothing.
      event.preventDefault()
      event.stopPropagation()
      if (selectedNode && canOpenGraphNodeMenu(selectedNode)) openMenuForNode(selectedNode)
      return
    }
    if (event.key === 'Enter' && selectedNode) {
      event.preventDefault()
      if (selectedNode.objectId && expandedRef.current.has(selectedNode.id)) openObject(selectedNode.objectId)
      else void expand(selectedNode)
      return
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const direction = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowLeft' ? 'left' : 'right'
    const nodes = simRef.current?.nodes() ?? []
    setSelected((current) => spatialNeighbor(nodes, hidden, current, direction))
    revealSheet()
  }

  const onStageKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.target === canvasRef.current) return
    if (density !== 'narrow' || sheet === 'dismissed' || !selected) return
    setSheet('dismissed')
  }

  const pin = () => {
    const node = simRef.current?.nodes().find((item) => item.id === selected)
    if (!node || node.x == null || node.y == null) return
    // Pin in place: the control stays on the card and can toggle back.
    node.fx = node.x
    node.fy = node.y
    setPinTick((tick) => tick + 1)
    drawRef.current(true)
  }

  const unpin = () => {
    const node = simRef.current?.nodes().find((item) => item.id === selected)
    if (!node) return
    // Unpin only releases the node; it never re-runs the layout.
    node.fx = null
    node.fy = null
    setPinTick((tick) => tick + 1)
    drawRef.current(true)
  }

  return (
    <div className={full ? 'graph-wrap graph-full' : 'graph-wrap'} data-testid={full ? 'graph-full' : undefined}>
      <div className="toolbar">
        <Button type="button" variant="default" data-testid="graph-fit" onClick={() => apiRef.current.fit()}>
          {copy.fitGraph}
        </Button>
        <Button type="button" variant="default" data-testid="graph-relayout" onClick={() => apiRef.current.relayout()}>
          {copy.relayout}
        </Button>
        <Button type="button" variant="default" onClick={() => setFull((value) => !value)}>
          {full ? copy.closeFull : copy.openFull}
        </Button>
        {model.capped ? <span className="hint">{copy.graphCapped}</span> : null}
      </div>
      <div
        className="graph-stage"
        ref={stageRef}
        data-testid="graph-stage"
        data-density={pane ? density : undefined}
        data-legend={pane ? legendLayout(density) : undefined}
        onKeyDown={onStageKey}
      >
        <div className="graph-frame">
          <div className="graph-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="graph"
              data-testid="graph"
              role="img"
              aria-label={copy.graph}
              tabIndex={0}
              onKeyDown={onKey}
            />
            <div className="graph-labels" data-testid="graph-labels" aria-hidden="true">
              {Object.entries(markers).map(([id, marker]) =>
                marker.shown && marker.localLabel ? (
                  <span
                    key={id}
                    className="graph-label"
                    data-graph-label={id}
                    style={{ left: marker.localLabel.left + 4, top: marker.localLabel.top }}
                  >
                    {scene.nodes.find((node) => node.id === id)?.caption ?? ''}
                  </span>
                ) : null,
              )}
            </div>
            {focusedNode && focusRing ? (
              <span
                className="graph-focus-ring"
                data-testid="graph-focus-ring"
                data-node-id={focusedNode.id}
                style={{
                  left: focusRing.left,
                  top: focusRing.top,
                  width: focusRing.size,
                  height: focusRing.size,
                }}
              />
            ) : null}
          </div>
          <div className="graph-legend" ref={legendRef} role="group" aria-label={copy.graphLegend}>
            {legend.map((entry) => {
              const visible = !hidden.has(entry.id)
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={visible ? 'legend-chip on' : 'legend-chip'}
                  aria-pressed={visible}
                  data-testid={`legend-${entry.id}`}
                  title={entry.label}
                  onClick={() =>
                    setHidden((current) => {
                      const next = new Set(current)
                      if (next.has(entry.id)) next.delete(entry.id)
                      else next.add(entry.id)
                      return next
                    })
                  }
                >
                  <i className={`dot ${entry.kind}`} data-swatch={entry.kind} />
                  <span className="legend-label">{entry.label}</span>
                  <span className="count">{counts[entry.id] ?? 0}</span>
                </button>
              )
            })}
          </div>
          <GraphInspector
            node={selectedNode}
            placement={placement}
            showProperties={showProperties}
            pinned={pinned}
            busy={busy === selectedNode?.id}
            maxHeightPx={chrome.maxHeightPx}
            inspectorRef={inspectorRef}
            onOpen={openObject}
            readOnly={modelMode}
            onDismiss={() => setSheet('dismissed')}
            onCollapse={() => setSheet('chip')}
            onReveal={() => setSheet('compact')}
            onSwipe={(deltaY) => setSheet((mode) => sheetAfterGesture(mode, deltaY))}
            onPin={pin}
            onUnpin={unpin}
          />
        </div>
      </div>
      <div className="graph-a11y" data-testid="graph-nodes">
        {shown.map((node) => (
          <button
            key={node.id}
            type="button"
            data-node-id={node.id}
            data-selected={node.id === selected ? 'true' : undefined}
            data-subtitle={node.subtitle}
            data-x={markers[node.id] ? String(markers[node.id].x) : undefined}
            data-y={markers[node.id] ? String(markers[node.id].y) : undefined}
            data-r={markers[node.id] ? String(markers[node.id].r) : undefined}
            data-label-left={markers[node.id] ? String(markers[node.id].label.left) : undefined}
            data-label-top={markers[node.id] ? String(markers[node.id].label.top) : undefined}
            data-label-right={markers[node.id] ? String(markers[node.id].label.right) : undefined}
            data-label-bottom={markers[node.id] ? String(markers[node.id].label.bottom) : undefined}
            onClick={() => selectRef.current(node.id)}
            onDoubleClick={() => {
              selectRef.current(node.id)
              void expand(node)
            }}
            onFocus={() => setFocused(node.id)}
            onBlur={() => {
              const id = node.id
              requestAnimationFrame(() => {
                const active = document.activeElement
                const menuOpen = Boolean(document.querySelector('[data-testid="context-menu"]'))
                if (menuOpen || (active instanceof Element && active.closest('[data-testid="context-menu"]'))) return
                setFocused((current) => (current === id ? '' : current))
              })
            }}
            onContextMenu={(event) => {
              if (!canOpenGraphNodeMenu(node) || prefersNativeContextMenu(event.target)) return
              event.preventDefault()
              openMenuForNode(node)
            }}
            onKeyDown={(event) => {
              if (opensNodeMenu(event)) {
                // Shift+F10 / ContextMenu on any node must not fall through to
                // the browser menu, even when the node has no node actions.
                event.preventDefault()
                event.stopPropagation()
                if (canOpenGraphNodeMenu(node)) openMenuForNode(node)
                return
              }
              if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
              event.preventDefault()
              const direction =
                event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowLeft' ? 'left' : 'right'
              const next = spatialNeighbor(simRef.current?.nodes() ?? [], hidden, node.id, direction)
              if (!next || next === node.id) return
              setSelected(next)
              revealSheet()
              const button = stageRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(next)}"]`)
              button?.focus({ preventScroll: true })
            }}
          >
            {node.caption}
          </button>
        ))}
      </div>
      <div className="graph-a11y" data-testid="graph-edges">
        {placed.edges.map((edge) => (
          <span
            key={edge.id}
            data-edge-id={edge.id}
            data-source={edge.source}
            data-target={edge.target}
            data-shown={shownEdges.has(edge.id) ? 'true' : 'false'}
          >{edge.label}</span>
        ))}
      </div>
      <div className="graph-a11y" data-testid="attribute-provenance">
        <p>{copy.attributeProvenance}</p>
        {scene.nodes
          .filter((node) => node.kind === 'value')
          .map((node) => (
            <p key={node.id}>
              <b>{node.caption}</b> {node.properties.find((property) => property.label === copy.origin)?.value ?? ''}
            </p>
          ))}
      </div>
      {add?.objectId && add.typeKey ? (
        <LinkAddFlow
          objectId={add.objectId}
          typeKey={add.typeKey}
          defs={activeDefs}
          request={add}
          onClose={() => setAdd(null)}
        />
      ) : null}
    </div>
  )
}

function GraphInspector({
  node,
  placement,
  showProperties,
  pinned,
  busy,
  maxHeightPx,
  inspectorRef,
  onOpen,
  readOnly,
  onDismiss,
  onCollapse,
  onReveal,
  onSwipe,
  onPin,
  onUnpin,
}: {
  node: SceneNode | null
  placement: DetailPlacement
  showProperties: boolean
  pinned: boolean
  busy: boolean
  maxHeightPx: number
  inspectorRef: RefObject<HTMLElement | null>
  onOpen: (id: string) => void
  readOnly?: boolean
  onDismiss: () => void
  onCollapse: () => void
  onReveal: () => void
  onSwipe: (deltaY: number) => void
  onPin: () => void
  onUnpin: () => void
}) {
  const drag = useRef({ y: 0, id: -1 })
  if (placement === 'hidden') return null
  const style = maxHeightPx > 0 ? { maxHeight: maxHeightPx } : undefined
  if (!node) {
    return (
      <aside ref={inspectorRef} className="graph-inspector" data-testid="graph-inspector" data-placement="side" style={style}>
        <MetaChip>{copy.graph}</MetaChip>
        <h3>{copy.graphSelect}</h3>
        <p className="hint">{copy.graphProperties}</p>
      </aside>
    )
  }
  const shownKind = node.kind === 'object' && node.typeName ? node.typeName : kindLabel(node.kind)
  const summary = nodeSummary(
    { caption: node.caption, subtitle: node.subtitle, kindLabel: shownKind, properties: node.properties },
    { type: copy.type, number: copy.number },
  )
  if (placement === 'chip') {
    return (
      <aside ref={inspectorRef} className="graph-inspector" data-testid="graph-inspector" data-placement="chip" aria-label={copy.graph} style={style}>
        <button type="button" className="graph-sheet-chip" data-testid="graph-sheet-chip" onClick={onReveal}>
          <i className={`dot ${node.kind}`} />
          <span>{summary.name}</span>
        </button>
      </aside>
    )
  }
  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    drag.current = { y: event.clientY, id: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== drag.current.id) return
    const delta = event.clientY - drag.current.y
    drag.current.id = -1
    onSwipe(delta)
  }
  return (
    <aside
      ref={inspectorRef}
      className="graph-inspector"
      data-testid="graph-inspector"
      data-placement={placement}
      aria-label={copy.graph}
      style={style}
    >
      {placement === 'sheet' ? (
        <div className="graph-sheet-sticky">
          <div
            className="graph-sheet-handle"
            data-testid="graph-sheet-handle"
            role="button"
            tabIndex={0}
            aria-label={copy.graphProperties}
            onPointerDown={onHandleDown}
            onPointerUp={onHandleUp}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onSwipe(0)
            }}
          />
          <div className="graph-sheet-bar">
            <p className="graph-kicker">
              <i className={`dot ${node.kind}`} />
              <span className="graph-kicker-text">{summary.type}</span>
            </p>
            <Button type="button" variant="icon" data-testid="graph-collapse" aria-label={copy.collapse} onClick={onCollapse}>
              <ChevronDown size={14} aria-hidden="true" />
            </Button>
            <Button type="button" variant="icon" data-testid="graph-dismiss" aria-label={copy.graphDismiss} onClick={onDismiss}>
              <X size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="graph-kicker">
          <i className={`dot ${node.kind}`} />
          {shownKind}
        </p>
      )}
      <h3>{placement === 'sheet' ? summary.name : node.caption}</h3>
      {placement === 'sheet' ? (
        summary.detail ? <p className="graph-number">{summary.detail}</p> : null
      ) : (
        <p className="hint">{node.subtitle}</p>
      )}
      {placement === 'sheet' && node.objectId ? (
        <Button type="button" variant="primary" className="graph-action" onClick={() => onOpen(node.objectId!)}>
          {openObjectLabel(node.typeName)}
        </Button>
      ) : null}
      {node.kind === 'object' && node.typeKey ? (
        <Button
          type="button"
          variant="ghost"
          className="graph-action"
          data-testid="graph-add-link"
          onClick={() => window.dispatchEvent(new CustomEvent('braian-add-link', { detail: {} }))}
        >
          <Link2 size={14} aria-hidden="true" />
          {copy.addLink}
        </Button>
      ) : null}
      {placement === 'sheet' && node.properties.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="graph-action"
          data-testid="graph-properties-toggle"
          aria-expanded={showProperties}
          onClick={() => onSwipe(0)}
        >
          <List size={14} aria-hidden="true" />
          {copy.graphProperties}
        </Button>
      ) : null}
      {showProperties ? (
        <>
          {placement === 'side' ? <h4>{copy.graphProperties}</h4> : null}
          <dl data-testid="graph-properties">
            {node.properties.map((property) => (
              <div key={property.label}>
                <dt>{property.label}</dt>
                <dd>{property.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      {placement === 'side' && node.objectId ? (
        <Button type="button" variant="primary" className="graph-action" onClick={() => onOpen(node.objectId!)}>
          {openObjectLabel(node.typeName)}
        </Button>
      ) : null}
      {!readOnly ? (
        pinned ? (
          <Button type="button" variant="ghost" className="graph-action" data-testid="graph-unpin" onClick={onUnpin}>
            <PinOff size={14} aria-hidden="true" />
            {copy.unpin}
          </Button>
        ) : (
          <Button type="button" variant="ghost" className="graph-action" data-testid="graph-pin" onClick={onPin}>
            <Pin size={14} aria-hidden="true" />
            {copy.pin}
          </Button>
        )
      ) : null}
      {busy ? <p className="hint">{copy.loading}</p> : null}
    </aside>
  )
}

function measureChromeBox(canvas: HTMLCanvasElement, element: HTMLElement | null): Box | null {
  return measureChromeBoxes(canvas, [element])[0] ?? null
}

function measureChromeBoxes(canvas: HTMLCanvasElement, elements: Array<HTMLElement | null>): Box[] {
  const origin = canvas.getBoundingClientRect()
  const boxes: Box[] = []
  for (const element of elements) {
    if (!element) continue
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const rect = element.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    boxes.push({
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
    })
  }
  return boxes
}

function seed(kind: NodeKind, index: number, total: number) {
  const ring = kind === 'object' || kind === 'type' ? 1 : kind === 'value' ? 2.1 : kind === 'class' ? 3 : kind === 'group' ? 3.6 : 4.2
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + ring
  const radius = ring * 72
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

function spatialNeighbor(
  nodes: SimNode[],
  hidden: Set<string>,
  current: string,
  direction: 'up' | 'down' | 'left' | 'right',
) {
  const visible = nodes.filter((node) => !isLegendHidden(hidden, node) && node.x != null && node.y != null)
  const self = visible.find((node) => node.id === current) ?? visible[0]
  if (!self) return current
  let best = self.id
  let bestScore = Infinity
  for (const node of visible) {
    if (node.id === self.id) continue
    const dx = (node.x ?? 0) - (self.x ?? 0)
    const dy = (node.y ?? 0) - (self.y ?? 0)
    const forward = direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy
    if (forward < 8) continue
    const lateral = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx)
    const score = lateral * 2.2 + forward
    if (score < bestScore) {
      bestScore = score
      best = node.id
    }
  }
  return best
}

function endId(end: SimLink['source']) {
  return typeof end === 'object' ? end.id : String(end)
}

function endNode(end: SimLink['source']) {
  return typeof end === 'object' ? end : undefined
}

function endRadius(end: SimLink['source']) {
  if (typeof end === 'object') return nodeRadius(end.kind, end.degree ?? 0)
  return 22
}

function labelBox(node: SimNode) {
  const radius = nodeRadius(node.kind, node.degree ?? 0)
  const labelW = Math.min(280, Math.max(radius * 2, node.caption.length * 7.2 + 16))
  const half = labelW / 2
  return {
    left: (node.x ?? 0) - half,
    right: (node.x ?? 0) + half,
    top: (node.y ?? 0) - radius - 2,
    bottom: (node.y ?? 0) + radius + 22,
  }
}

function labelCollision(): Force<SimNode, SimLink> {
  let nodes: SimNode[] = []
  const force: Force<SimNode, SimLink> = (alpha: number) => {
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]
      if (!a || a.x == null || a.y == null) continue
      const boxA = labelBox(a)
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]
        if (!b || b.x == null || b.y == null) continue
        const boxB = labelBox(b)
        const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left)
        const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top)
        if (overlapX <= 0 || overlapY <= 0) continue
        const aPinned = a.fx != null
        const bPinned = b.fx != null
        if (aPinned && bPinned) continue
        const push = alpha * 0.85
        if (overlapX < overlapY) {
          const sign = (a.x ?? 0) <= (b.x ?? 0) ? -1 : 1
          const mag = overlapX * 0.5 * push
          if (!aPinned) a.vx = (a.vx ?? 0) + sign * mag * (bPinned ? 2 : 1)
          if (!bPinned) b.vx = (b.vx ?? 0) - sign * mag * (aPinned ? 2 : 1)
        } else {
          const sign = (a.y ?? 0) <= (b.y ?? 0) ? -1 : 1
          const mag = overlapY * 0.5 * push
          if (!aPinned) a.vy = (a.vy ?? 0) + sign * mag * (bPinned ? 2 : 1)
          if (!bPinned) b.vy = (b.vy ?? 0) - sign * mag * (aPinned ? 2 : 1)
        }
      }
    }
  }
  force.initialize = (next: SimNode[]) => {
    nodes = next
  }
  return force
}

async function lookupNames(ids: string[]): Promise<Record<string, KnownObject>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const found: Record<string, KnownObject> = {}
  for (let index = 0; index < unique.length; index += 400) {
    const slice = unique.slice(index, index + 400)
    const body = await api.post('/v1/objects/names', { body: { ids: slice } })
    const rows = (body.objects as Json[] | undefined) ?? []
    for (const row of rows) {
      const id = String(row.id ?? '')
      if (!id) continue
      found[id] = { name: String(row.name ?? '').trim(), typeKey: String(row.type ?? ''), key: String(row.key ?? '') }
    }
  }
  return found
}

async function resolveNames(ids: string[], base: Record<string, KnownObject>) {
  const missing = [...new Set(ids.filter((id) => id && !base[id]))]
  if (!missing.length) return base
  try {
    const found = await lookupNames(missing)
    const next = { ...base }
    for (const id of missing) next[id] = found[id] ?? { name: '', typeKey: '' }
    return next
  } catch {
    return base
  }
}

function bendOf(id: string, len: number) {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 33 + id.charCodeAt(index)) >>> 0
  const sign = hash % 2 === 0 ? 1 : -1
  return sign * Math.min(72, Math.max(18, len * 0.18))
}

function curveTangent(
  from: { x: number; y: number },
  control: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
) {  return {
    x: 2 * (1 - t) * (control.x - from.x) + 2 * t * (to.x - control.x),
    y: 2 * (1 - t) * (control.y - from.y) + 2 * t * (to.y - control.y),
  }
}

function pointAtDistance(
  from: { x: number; y: number },
  control: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  fromEnd: boolean,
) {
  let low = 0
  let high = 1
  for (let step = 0; step < 16; step += 1) {
    const mid = (low + high) / 2
    const point = curvePoint(from, control, to, mid)
    const origin = fromEnd ? to : from
    const dist = Math.hypot(point.x - origin.x, point.y - origin.y)
    if (fromEnd) {
      if (dist > radius) low = mid
      else high = mid
    } else if (dist < radius) low = mid
    else high = mid
  }
  const t = fromEnd ? high : low
  return { t, point: curvePoint(from, control, to, t) }
}

function arrow(context: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const size = 8
  context.beginPath()
  context.moveTo(x, y)
  context.lineTo(x - size * Math.cos(angle - 0.45), y - size * Math.sin(angle - 0.45))
  context.lineTo(x - size * Math.cos(angle + 0.45), y - size * Math.sin(angle + 0.45))
  context.closePath()
  context.fill()
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function haloText(context: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, plate: string) {
  context.font = '12px "Inter Variable", Inter, sans-serif'
  const width = context.measureText(text).width
  const padX = 5
  const height = 16
  context.fillStyle = plate
  roundRect(context, x - width / 2 - padX, y - height / 2, width + padX * 2, height, 4)
  context.fill()
  context.lineWidth = 3
  context.strokeStyle = plate
  context.strokeText(text, x, y)
  context.fillStyle = fill
  context.fillText(text, x, y)
}

function luminance(color: string) {
  const hex = color.trim()
  if (hex.startsWith('#')) {
    const body = hex.length >= 7 ? hex.slice(1, 7) : hex.slice(1)
    const red = Number.parseInt(body.slice(0, 2), 16)
    const green = Number.parseInt(body.slice(2, 4), 16)
    const blue = Number.parseInt(body.slice(4, 6), 16)
    if ([red, green, blue].some((channel) => Number.isNaN(channel))) return 0
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  }
  const match = color.match(/[\d.]+/g)
  if (!match || match.length < 3) return 0
  const [red, green, blue] = match.slice(0, 3).map(Number)
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
}

function ink(fill: string, text: string, bg: string) {
  const filled = luminance(fill)
  return Math.abs(filled - luminance(text)) >= Math.abs(filled - luminance(bg)) ? text : bg
}
