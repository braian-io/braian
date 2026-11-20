import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2, MoreHorizontal, X } from 'lucide-react'
import { ViewGlyph } from './chips'
import { Button } from './components/ui/button'
import { Kbd } from './components/ui/kbd'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { viewDisplayTitle } from './demo-labels'
import { looksLikeRawViewId } from './model-workspace-migrate'
import { copy } from './i18n'
import { openSharedContextMenu, prefersNativeContextMenu } from './shared-context-menu'
import {
  activate,
  applyLayoutCommand,
  dockEdge,
  findTabs,
  leaves,
  moveView,
  setDivider,
  setTabIndex,
  views,
  zoomView,
  zoneFromPoint,
  type LayoutDoc,
  type Leaf,
  type Node,
  type ViewRef,
  type Zone,
} from './layout'

export type DockView = {
  id: string
  title: string
  type: string
  state?: { catalog?: string; prompt?: string }
  sourceLabel?: string
  /** Peer source is active; one click on the label returns to all-of-type. */
  sourceLabelClearable?: boolean
  /** Accessible name for clearing a peer source (destination All …, not the live peer label). */
  sourceLabelClearAriaLabel?: string
  prompt?: string
}

type Hover =
  | { kind: 'edge'; zone: Exclude<Zone, 'center'> }
  | { kind: 'pane'; anchor: string; zone: Zone; tabIndex?: number }

type Drag = { view: string; title: string; type: string; x: number; y: number; hover: Hover | null }

const EDGE = 10
const PREVIEW_INSET = 4
/** Bottom-right of the pointer, clear of the centred zone chip. */
const GHOST_X = 18
const GHOST_Y = 22
const EDGE_SHARE = 0.3
const SPLIT_GAP = 6
/**
 * Below 1360px a 30% column cannot keep Detail at 360px and Products within
 * 25% of its closed width. 200px still sits in the row (it does not cover
 * Detail): at 1280px the catalog keeps about 1062px, so Products stays near
 * 386px (about 21% under the closed 489px) and Detail stays above 360px.
 */
const NARROW_AGENT_DOCK = '(max-width: 1359px)'
const NARROW_AGENT_DOCK_PX = 200

function useMatchMedia(query: string) {
  const [matches, setMatches] = useState(false)
  useLayoutEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const apply = () => setMatches(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [query])
  return matches
}

/** Pixel width of the open agent column. Both ends of the transition are px so the width interpolates. */
function agentColumnPx(dockBox: number, ratio: number, gaps: number, narrow: boolean): number {
  if (narrow) return NARROW_AGENT_DOCK_PX
  if (!(dockBox > 0) || !(ratio > 0)) return 0
  return Math.max(0, Math.round((dockBox - gaps) * ratio))
}

export function WorkspaceDock({
  doc,
  views: viewList,
  onChange,
  renderView,
  onAddView,
  onSourceLabelClear,
  agentViews = [],
}: {
  doc: LayoutDoc
  views: DockView[]
  onChange: (doc: LayoutDoc) => void
  renderView: (view: DockView) => ReactNode
  onAddView: (target: string) => void
  onSourceLabelClear?: (viewId: string) => void
  /** View ids an agent is working in. The pane picks up one left-edge marker. */
  agentViews?: string[]
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  /** Structure-tree column, measured while the agent dock is closed. */
  const treePinRef = useRef<TreePin | null>(null)
  const [measuredTreePin, setMeasuredTreePin] = useState<TreePin | null>(null)
  const docRef = useRef(doc)
  const changeRef = useRef(onChange)
  const viewsRef = useRef(viewList)
  docRef.current = doc
  changeRef.current = onChange
  viewsRef.current = viewList
  const agentViewSet = new Set(agentViews)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  // View chrome menus open through the shared command registry.

  const commit = (next: LayoutDoc) => {
    docRef.current = next
    changeRef.current(next)
  }
  const run = (name: string, args: Record<string, unknown> = {}) => {
    const result = applyLayoutCommand(docRef.current, name, args, { views: asRefs(viewsRef.current) })
    if (result.handled) commit(result.doc)
  }

  useEffect(() => {
    if (!drag) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [drag])

  const open = views(doc.layout)
  const viewTypes = new Map(viewList.map((view) => [view.id, view.type]))
  const narrowDock = useMatchMedia(NARROW_AGENT_DOCK)
  const [dockBox, setDockBox] = useState(0)
  const rootAgentOpen = doc.layout.type === 'split' && splitLocksAgentDock(doc.layout, viewTypes)
  const [holdClosed, setHoldClosed] = useState(false)
  const motionReady = useRef(false)
  // Paint one closed frame before expanding, after the browser has painted.
  // A rAF started from the layout effect runs before that paint and skips the animation.
  useLayoutEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!rootAgentOpen || reduce || !motionReady.current) {
      motionReady.current = true
      setHoldClosed(false)
      return
    }
    setHoldClosed(true)
  }, [rootAgentOpen])
  useEffect(() => {
    if (!holdClosed) return
    const id = window.requestAnimationFrame(() => setHoldClosed(false))
    return () => window.cancelAnimationFrame(id)
  }, [holdClosed])
  const presentAgentOpen = rootAgentOpen && !holdClosed
  const catalogRatio =
    doc.layout.type === 'split' && splitLocksAgentDock(doc.layout, viewTypes)
      ? doc.layout.ratios[0] ?? 1
      : null
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      const box = root.clientWidth
      setDockBox((current) => (current === box ? current : box))
      const next = measureStructureTreePin(docRef.current.layout, new Map(viewsRef.current.map((view) => [view.id, view.type])), root)
      if (!next) return
      const scaled =
        catalogRatio != null && treePinRef.current
          ? treePinRef.current
          : catalogRatio != null
            ? catalogRatioToFullDockPin(next, catalogRatio)
            : next
      treePinRef.current = scaled
      setMeasuredTreePin(scaled)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(root)
    return () => observer.disconnect()
  }, [catalogRatio, doc.layout])
  const zoomHost = doc.zoom ? leaves(doc.layout).find((leaf) => leaf.views.includes(doc.zoom ?? '')) : undefined
  const zoomed = zoomHost && doc.zoom ? { ...zoomHost, views: [doc.zoom], active: 0 } : undefined
  const shared: Frame = {
    doc,
      viewList,
      agentViews: agentViewSet,
      agentTreePin: catalogRatio != null ? measuredTreePin : null,
      drag,
    docRef,
    rootRef,
    dragRef,
    commit,
    run,
    onAddView,
    onSourceLabelClear,
    onMenu: ({ x, y, view }) => {
      const viewType = viewList.find((item) => item.id === view)?.type ?? ''
      openSharedContextMenu({
        context: 'dock-view',
        x,
        y,
        target: { viewId: view, viewType },
      })
    },
    onDrag: setDrag,
    renderView,
  }

  return (
    <TooltipProvider delayDuration={400} disableHoverableContent>
    <div
      ref={rootRef}
      className={drag ? 'dock-root dragging' : 'dock-root'}
      data-testid="dock"
      data-focus={doc.focus ?? ''}
      data-zoom={doc.zoom ?? ''}
      data-leaves={leaves(doc.layout)
        .map((leaf) => leaf.views.join('+'))
        .join('|')}
    >
      {open.length === 0 ? (
        <section className="pane" data-pane="empty">
          <div className="pane-tabs" />
          <div className="pane-body">{copy.empty}</div>
        </section>
      ) : zoomed ? (
        <Pane frame={shared} leaf={zoomed} />
      ) : (
        <SplitNode
          frame={shared}
          node={doc.layout}
          path={[]}
          narrowDock={narrowDock}
          presentAgentOpen={presentAgentOpen}
          agentDockedOpen={rootAgentOpen}
          dockBox={dockBox}
        />
      )}
      {(['left', 'right', 'top', 'bottom'] as const).map((zone) => (
        <div key={zone} className={`edge-band ${zone}`} data-testid={`edge-${zone}`} />
      ))}
      {drag?.hover?.kind === 'edge' ? (
        <div
          className="dock-preview"
          data-testid="drop-overlay"
          data-zone={drag.hover.zone}
          data-edge="true"
          style={edgePreviewStyle(drag.hover.zone)}
        >
          <span data-testid={`drop-${drag.hover.zone}`}>{zoneLabel(drag.hover.zone)}</span>
        </div>
      ) : null}
      {drag && typeof document !== 'undefined'
        ? createPortal(
            <div className="drag-ghost" data-testid="drag-ghost" style={{ left: drag.x + GHOST_X, top: drag.y + GHOST_Y }}>
              <ViewGlyph type={drag.type} />
              <span>{drag.title}</span>
            </div>,
            document.body,
          )
        : null}
      {null}
    </div>
    </TooltipProvider>
  )
}

type Frame = {
  doc: LayoutDoc
  viewList: DockView[]
  drag: Drag | null
  docRef: RefObject<LayoutDoc>
  rootRef: RefObject<HTMLDivElement | null>
  dragRef: RefObject<Drag | null>
  commit: (doc: LayoutDoc) => void
  run: (name: string, args?: Record<string, unknown>) => void
  onAddView: (target: string) => void
  onSourceLabelClear?: (viewId: string) => void
  onMenu: (menu: { x: number; y: number; view: string }) => void
  onDrag: (drag: Drag | null) => void
  renderView: (view: DockView) => ReactNode
  agentViews: Set<string>
  /** Pixel width of the structure tree measured before this dock opened. */
  agentTreePin: TreePin | null
}

export type TreePin = { width: number; ratio: number }

/** Tree width measured inside the shrunk catalog column maps to full-dock pixels. */
export function catalogRatioToFullDockPin(pin: TreePin, catalogRatio: number | null): TreePin {
  if (catalogRatio == null || !(catalogRatio > 0) || catalogRatio >= 0.999) return pin
  return { width: pin.width / catalogRatio, ratio: pin.ratio }
}

/**
 * Width to lock the structure-tree column to once the agent dock is open.
 * `pin.width` is the leaf's rendered width before the dock opened (flex shrink
 * included). Scaling by the live ratio keeps a divider drag in proportion.
 */
function pinnedTreeWidthPx(pin: TreePin | null, ratio: number): number | null {
  if (!pin || !(pin.width > 0) || !(pin.ratio > 0) || !(ratio > 0)) return null
  return Math.round((pin.width * ratio) / pin.ratio)
}

function splitRatioAt(layout: Node, leafPath: number[]): number | null {
  const index = leafPath[leafPath.length - 1]
  if (index == null) return null
  let node: Node = layout
  for (const step of leafPath.slice(0, -1)) {
    if (node.type !== 'split') return null
    const next = node.children[step]
    if (!next) return null
    node = next
  }
  if (node.type !== 'split') return null
  const ratio = node.ratios[index]
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

/** The structure-tree leaf's split cell, in pixels, from the layout before the agent dock opens. */
function measureStructureTreePin(layout: Node, viewTypes: Map<string, string>, root: HTMLElement): TreePin | null {
  const leaf = leaves(layout).find((item) => item.views.some((id) => viewTypes.get(id) === 'structure_tree'))
  if (!leaf || leaf.path.length === 0) return null
  const tab = root.querySelector<HTMLElement>(".pane-tab[data-view-type='structure_tree']")
  const cell = tab?.closest('section.pane')?.parentElement
  if (!(cell instanceof HTMLElement) || !cell.classList.contains('split-cell')) return null
  const width = cell.getBoundingClientRect().width
  if (!(width > 0)) return null
  const ratio = splitRatioAt(layout, leaf.path)
  if (ratio == null || !(ratio > 0)) return null
  return { width, ratio }
}

/** Open agent column, or the empty shell left behind so catalog panes are not remounted. */
function isAgentDockSplit(node: Extract<Node, { type: 'split' }>, viewTypes: Map<string, string>) {
  if (node.dir !== 'horizontal' || node.children.length !== 2) return false
  const right = node.children[1]
  if (!right || right.type !== 'tabs') return false
  if (right.views.some((id) => viewTypes.get(id) === 'agent')) return true
  return right.views.length === 0 && node.children[0]?.type === 'split'
}

/** A horizontal agent dock must not let the Detail flex rules resize the left subtree. */
function splitLocksAgentDock(node: Extract<Node, { type: 'split' }>, viewTypes: Map<string, string>) {
  if (node.dir !== 'horizontal' || node.children.length !== 2) return false
  return node.children.some(
    (child) => child.type === 'tabs' && child.views.some((id) => viewTypes.get(id) === 'agent'),
  )
}

function childIsStructureTree(child: Node, viewTypes: Map<string, string>) {
  return child.type === 'tabs' && child.views.some((id) => viewTypes.get(id) === 'structure_tree')
}

/** Pin the Food/structure tree so catalog shrink only narrows Products and Detail. */
function splitPinsTreeInAgentDock(
  inAgentDock: boolean,
  node: Extract<Node, { type: 'split' }>,
  viewTypes: Map<string, string>,
) {
  if (!inAgentDock || node.dir !== 'horizontal' || node.children.length !== 2) return false
  return childIsStructureTree(node.children[0], viewTypes)
}

function SplitNode({
  frame,
  node,
  path,
  inAgentDock = false,
  narrowDock = false,
  presentAgentOpen = false,
  agentDockedOpen = false,
  dockBox = 0,
}: {
  frame: Frame
  node: Node
  path: number[]
  inAgentDock?: boolean
  narrowDock?: boolean
  presentAgentOpen?: boolean
  agentDockedOpen?: boolean
  dockBox?: number
}) {
  if (node.type !== 'split') {
    const leaf = leaves(node)[0]
    if (!leaf) return null
    return <Pane frame={frame} leaf={{ ...leaf, path }} />
  }
  const viewTypes = new Map(frame.viewList.map((view) => [view.id, view.type]))
  const lockRatios = splitLocksAgentDock(node, viewTypes)
  const agentShell = isAgentDockSplit(node, viewTypes)
  // Same rule as main: a split that contains Detail anywhere can shrink so the
  // table floor (440px once the split is at least 640px) holds and Detail
  // gives way. The agent-dock wrapper also contains Detail, but marking it
  // would make the whole dock the container and floor nested tables against it.
  const hasDetail = !lockRatios && views(node).some((id) => viewTypes.get(id) === 'object_detail')
  const gaps = Math.max(0, node.children.length - 1) * 6
  const subtreeInAgentDock = inAgentDock || lockRatios
  const pinTree = splitPinsTreeInAgentDock(subtreeInAgentDock && !lockRatios, node, viewTypes)
  const className = [
    'split',
    node.dir,
    lockRatios ? 'split-agent-dock' : '',
  ].filter(Boolean).join(' ')
  return (
    <div
      className={className}
      data-path={path.join('.') || 'root'}
      data-has-detail={hasDetail ? 'true' : undefined}
      data-agent-dock={lockRatios ? 'true' : undefined}
      data-agent-shell={agentShell ? 'true' : undefined}
      data-tree-pinned={pinTree ? 'true' : undefined}
    >
      {node.children.map((child, index) => (
        <SplitChild
          key={agentShell && index === 1 ? 'agent-dock-shell' : cellKey(path, index, child)}
          frame={frame}
          node={node}
          child={child}
          index={index}
          path={path}
          gaps={gaps}
          hasDetail={hasDetail}
          inAgentDock={subtreeInAgentDock}
          pinTree={pinTree}
          pinTreeRatio={node.ratios[0] ?? 0}
          narrowDock={narrowDock}
          presentAgentOpen={presentAgentOpen}
          agentDockedOpen={agentDockedOpen}
          dockBox={dockBox}
          agentShell={agentShell}
        />
      ))}
    </div>
  )
}

function SplitChild({
  frame,
  node,
  child,
  index,
  path,
  gaps,
  hasDetail,
  inAgentDock,
  pinTree,
  pinTreeRatio,
  narrowDock,
  presentAgentOpen,
  agentDockedOpen,
  dockBox,
  agentShell,
}: {
  frame: Frame
  node: Extract<Node, { type: 'split' }>
  child: Node
  index: number
  path: number[]
  gaps: number
  hasDetail: boolean
  inAgentDock: boolean
  pinTree: boolean
  pinTreeRatio: number
  narrowDock: boolean
  presentAgentOpen: boolean
  agentDockedOpen: boolean
  dockBox: number
  agentShell: boolean
}) {
  const ratio = node.ratios[index] ?? 0
  const basis = `calc((100% - ${gaps}px) * ${ratio})`
  const flex = hasDetail ? '0 1' : '0 0'
  const pinnedPx = pinTree && index === 0 ? pinnedTreeWidthPx(frame.agentTreePin, pinTreeRatio) : null
  const agentShellRight = agentShell && index === 1
  const openPx = agentColumnPx(dockBox, ratio, gaps, narrowDock)
  const cellRef = useRef<HTMLDivElement>(null)
  const openPxRef = useRef(openPx)
  const presentRef = useRef(presentAgentOpen)
  openPxRef.current = openPx
  /* flex-basis stays auto so the width property is the size that transitions. */
  const agentWidth = presentAgentOpen ? openPx : 0
  useLayoutEffect(() => {
    const el = cellRef.current
    if (!el || !agentShellRight) return
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const wasOpen = presentRef.current
    presentRef.current = presentAgentOpen
    if (!wasOpen || presentAgentOpen || reduce || !(openPxRef.current > 0)) return
    el.style.width = `${openPxRef.current}px`
    void el.offsetWidth
    el.style.width = '0px'
  }, [presentAgentOpen, agentShellRight])
  const cellStyle: CSSProperties = agentShellRight
    ? {
        flex: '0 0 auto',
        width: `${agentWidth}px`,
        minWidth: 0,
        maxWidth: 'none',
        overflow: 'hidden',
        pointerEvents: agentDockedOpen ? undefined : 'none',
      }
    : agentShell && index === 0 && narrowDock
      ? { flex: '1 1 auto', width: 'auto', minWidth: 0, maxWidth: 'none' }
      : pinnedPx != null
          ? {
              flex: `0 0 ${pinnedPx}px`,
              width: `${pinnedPx}px`,
              minWidth: `${pinnedPx}px`,
              maxWidth: `${pinnedPx}px`,
            }
          : pinTree && index === 1 && frame.agentTreePin
            ? { flex: '1 1 0', minWidth: 0 }
            : { flex: `${flex} ${basis}` }
  return (
    <>
      {index > 0 ? (
        <Divider
          frame={frame}
          dir={node.dir}
          index={index - 1}
          path={path}
          count={node.children.length}
        />
      ) : null}
      <div
        ref={agentShellRight ? cellRef : undefined}
        className="split-cell"
        style={cellStyle}
        data-agent-dock-cell={agentShellRight ? 'true' : undefined}
      >
          <SplitNode
            frame={frame}
            node={child}
            path={[...path, index]}
            inAgentDock={inAgentDock}
            narrowDock={narrowDock}
            presentAgentOpen={presentAgentOpen}
            agentDockedOpen={agentDockedOpen}
            dockBox={dockBox}
          />
      </div>
    </>
  )
}

function Divider({
  frame,
  dir,
  index,
  path,
  count,
  dockedLeft,
  hidden = false,
}: {
  frame: Frame
  dir: 'horizontal' | 'vertical'
  index: number
  path: number[]
  count: number
  dockedLeft?: string
  hidden?: boolean
}) {
  const [active, setActive] = useState(false)
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const container = event.currentTarget.parentElement
    if (!container) return
    const horizontal = dir === 'horizontal'
    setActive(true)
    const onMove = (ev: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const span = (horizontal ? rect.width : rect.height) - Math.max(0, count - 1) * 6
      const pointer = (horizontal ? ev.clientX - rect.left : ev.clientY - rect.top) - index * 6 - 3
      const position = span > 0 ? pointer / span : 0
      const current = frame.docRef.current
      frame.commit({ ...current, layout: setDivider(current.layout, path, index, position) })
    }
    const onUp = () => {
      setActive(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return (
    <div
      className={`split-divider ${dir}`}
      data-testid="split-divider"
      data-active={active ? 'true' : 'false'}
      role="separator"
      aria-orientation={dir === 'horizontal' ? 'vertical' : 'horizontal'}
      style={
        hidden
          ? { flex: '0 0 0px', width: 0, minWidth: 0, overflow: 'hidden', pointerEvents: 'none' }
          : dockedLeft
            ? { position: 'absolute', left: dockedLeft, top: 0, bottom: 0, margin: 0 }
            : undefined
      }
      onPointerDown={onPointerDown}
    >
      <span />
    </div>
  )
}

/** Put the active tab's start in the strip. A tab that does not fit aligns left so the ellipsis is at the end. Earlier tabs are pulled in whole, or left fully outside, so a name never starts off-screen. */
export function revealActiveTab(list: HTMLElement, activeId: string) {
  const pad = list.querySelector<HTMLElement>(':scope > .pane-tab-pad')
  if (pad) pad.style.width = `${list.clientWidth}px`
  const tabs = [...list.querySelectorAll<HTMLElement>('[data-tab]')]
  const index = tabs.findIndex((item) => item.dataset.tab === activeId)
  const tab = tabs[index]
  if (!tab) return
  const shift = (amount: number) => {
    if (Math.abs(amount) < 0.5) return
    const max = Math.max(0, list.scrollWidth - list.clientWidth)
    list.scrollLeft = Math.min(max, Math.max(0, list.scrollLeft + amount))
  }
  const viewOf = () => list.getBoundingClientRect()
  const activeBox = () => tab.getBoundingClientRect()
  // Pin the start first. The trailing pad makes this possible for the last tab,
  // so a neighbor is never left half-visible on the left.
  shift(activeBox().left - viewOf().left)
  for (let i = index - 1; i >= 0; i -= 1) {
    const prev = tabs[i]
    if (!prev) break
    const view = viewOf()
    const active = activeBox()
    if (active.right > view.right + 0.5) break
    const prevBox = prev.getBoundingClientRect()
    const revealBy = view.left - prevBox.left
    if (revealBy <= 0.5) continue
    const room = view.right - active.right
    if (revealBy > room + 0.5) break
    shift(-revealBy)
  }
}

function Pane({ frame, leaf }: { frame: Frame; leaf: Leaf }) {
  const activeId = leaf.views[leaf.active] ?? leaf.views[0]
  const focused = frame.doc.focus != null && leaf.views.includes(frame.doc.focus)
  const hover = frame.drag?.hover
  const preview = hover?.kind === 'pane' && leaf.views.includes(hover.anchor) ? hover.zone : null
  const dragged = useRef(false)
  const pendingActive = useRef<{ view: string; timer: number } | null>(null)
  const tabList = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const list = tabList.current
    if (!list || !activeId) return
    const reveal = () => revealActiveTab(list, activeId)
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(list)
    return () => observer.disconnect()
  }, [activeId, leaf.views])

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.tab-x')) return
    const startX = event.clientX
    const startY = event.clientY
    const meta = frame.viewList.find((view) => view.id === id)
    const title = titleOf(frame.viewList, id)
    const type = meta?.type ?? ''
    let started = false
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
      started = true
      dragged.current = true
      const hoverAt = frame.rootRef.current ? hitTest(frame.rootRef.current, ev.clientX, ev.clientY, id) : null
      const next: Drag = { view: id, title, type, x: ev.clientX, y: ev.clientY, hover: hoverAt }
      frame.dragRef.current = next
      frame.onDrag(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const current = frame.dragRef.current
      frame.dragRef.current = null
      frame.onDrag(null)
      if (started && current) frame.commit(dropView(frame.docRef.current, current))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <section
      className={focused ? 'pane focused' : 'pane'}
      data-pane={activeId ?? 'empty'}
      data-anchor={activeId ?? ''}
      data-views={leaf.views.join(',')}
      data-agent-working={activeId && frame.agentViews.has(activeId) ? 'true' : undefined}
      tabIndex={-1}
      onMouseDown={(event) => {
        if (!(event.target instanceof Element)) return
        if (event.target.closest('button, a, input, textarea, select')) return
        if (activeId && !frame.doc.zoom) frame.commit(activateDoc(frame.docRef.current, activeId))
      }}
    >
      <div className="pane-tabs">
        <div className="pane-tab-list" ref={tabList}>
          {leaf.views.map((id) => {
            const title = titleOf(frame.viewList, id)
            const prompt = frame.viewList.find((view) => view.id === id)?.prompt
            const tabTitle = prompt ? `${title} — ${prompt}` : title
            return (
              <Tooltip key={id}>
                <div
                  data-tab={id}
                  data-view-type={frame.viewList.find((view) => view.id === id)?.type ?? ''}
                  className={id === activeId ? 'pane-tab active' : 'pane-tab'}
                  title={tabTitle}
                  onContextMenu={(event) => {
                    if (prefersNativeContextMenu(event.target)) return
                    event.preventDefault()
                    frame.onMenu({ x: event.clientX, y: event.clientY, view: id })
                  }}
                >
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="pane-tab-open"
                      title={tabTitle}
                      onClick={() => {
                        if (dragged.current) {
                          dragged.current = false
                          if (pendingActive.current) window.clearTimeout(pendingActive.current.timer)
                          pendingActive.current = null
                          return
                        }
                        if (frame.docRef.current.zoom) return
                        frame.commit(activateDoc(frame.docRef.current, id))
                        if (pendingActive.current) window.clearTimeout(pendingActive.current.timer)
                        const timer = window.setTimeout(() => {
                          pendingActive.current = null
                        }, 500)
                        if (pendingActive.current) pendingActive.current.timer = timer
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        dragged.current = false
                        const previous = pendingActive.current?.view
                        if (pendingActive.current) window.clearTimeout(pendingActive.current.timer)
                        pendingActive.current = null
                        const current = frame.docRef.current
                        if (current.zoom === id) {
                          frame.commit(zoomView(current, id))
                          return
                        }
                        const base = previous ? activateDoc(current, previous) : current
                        frame.commit(zoomView(base, id))
                      }}
                      onPointerDown={(event) => {
                        if (!frame.docRef.current.zoom && !pendingActive.current) {
                          pendingActive.current = { view: leaf.views[leaf.active] ?? id, timer: 0 }
                        }
                        beginDrag(event, id)
                      }}
                      onMouseDown={(event) => {
                        if (event.button === 1) {
                          event.preventDefault()
                          frame.run('close_view', { view: id })
                        }
                      }}
                    >
                      <span>{title}</span>
                    </button>
                  </TooltipTrigger>
                  <Button
                    type="button"
                    variant="icon"
                    className="tab-x"
                    aria-label="Close tab"
                    title={`Close ${title}`}
                    data-testid={`close-tab-${id}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      frame.run('close_view', { view: id })
                    }}
                  >
                    <X size={14} aria-hidden="true" />
                  </Button>
                </div>
                <TooltipContent>
                  <span>{title}</span>
                  <span>{prompt ?? (frame.doc.zoom === id ? copy.doubleClickRestore : copy.doubleClickMaximize)}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}
          <div className="pane-tab-pad" aria-hidden="true" />
        </div>
        {(() => {
          const meta = frame.viewList.find((view) => view.id === activeId)
          const label = meta?.sourceLabel
          if (!label || !activeId) return null
          if (meta?.sourceLabelClearable && frame.onSourceLabelClear) {
            return (
              <Button
                type="button"
                variant="ghost"
                className="pane-source"
                data-testid="view-source-label"
                title={label}
                aria-label={meta.sourceLabelClearAriaLabel ?? copy.clearViewSource.replace('{label}', label)}
                onClick={() => frame.onSourceLabelClear?.(activeId)}
              >
                {label}
              </Button>
            )
          }
          return (
            <span className="pane-source" data-testid="view-source-label" title={label}>
              {label}
            </span>
          )
        })()}
        <div className="pane-chrome">
          <Button
            type="button"
            variant="icon"
            aria-label={copy.viewMenu}
            data-testid="view-menu"
            onClick={(event) => activeId && frame.onMenu({ x: event.clientX, y: event.clientY + 8, view: activeId })}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="icon"
                data-testid="pane-maximize"
                aria-label={frame.doc.zoom ? copy.restore : copy.maximize}
                aria-keyshortcuts="Control+Alt+Z"
                onClick={() => activeId && frame.run('zoom', { view: activeId })}
              >
                {frame.doc.zoom ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span>{frame.doc.zoom ? copy.restore : copy.maximize}</span>
              <Kbd>Ctrl</Kbd>
              <Kbd>Alt</Kbd>
              <Kbd>Z</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="pane-body">
        {activeId ? frame.renderView(frame.viewList.find((view) => view.id === activeId) ?? { id: activeId, title: copy.missingViewTab, type: '' }) : <p>{copy.empty}</p>}
      </div>
      {preview ? (
        <div className="dock-preview" data-testid="drop-overlay" data-zone={preview} style={previewStyle(preview)}>
          <span data-testid={`drop-${preview}`}>{zoneLabel(preview)}</span>
        </div>
      ) : null}
    </section>
  )
}


function dropView(doc: LayoutDoc, drag: Drag): LayoutDoc {
  const hover = drag.hover
  if (!hover) return doc
  let layout = doc.layout
  try {
    if (hover.kind === 'edge') {
      layout = dockEdge(layout, drag.view, hover.zone, 0.3)
    } else if (hover.tabIndex != null) {
      const pane = findTabs(layout, hover.anchor)
      if (pane?.views.includes(drag.view)) layout = setTabIndex(layout, drag.view, hover.tabIndex)
      else {
        const anchor = pane?.views.find((id) => id !== drag.view) ?? hover.anchor
        layout = setTabIndex(moveView(layout, drag.view, anchor, 'center'), drag.view, hover.tabIndex)
      }
    } else {
      const pane = findTabs(layout, hover.anchor)
      if (hover.zone !== 'center' && pane && pane.views.length === 1 && pane.views[0] === drag.view) return doc
      const anchor = pane?.views.find((id) => id !== drag.view) ?? hover.anchor
      layout = moveView(layout, drag.view, anchor, hover.zone)
    }
  } catch {
    return doc
  }
  return { ...doc, layout: activate(layout, drag.view), focus: drag.view, zoom: undefined }
}

function hitTest(root: HTMLElement, x: number, y: number, view: string): Hover | null {
  const rect = root.getBoundingClientRect()
  if (x < rect.left || y < rect.top || x > rect.right || y > rect.bottom) return null
  const edge = edgeAt(rect, x, y)
  if (edge) return { kind: 'edge', zone: edge }
  const target = document.elementFromPoint(x, y)
  const pane = target instanceof Element ? target.closest<HTMLElement>('[data-pane]') : null
  const anchor = pane?.dataset.anchor
  if (!pane || !anchor) return null
  const strip = pane.querySelector<HTMLElement>('.pane-tabs')
  if (strip && target instanceof Element && strip.contains(target)) {
    return { kind: 'pane', anchor, zone: 'center', tabIndex: insertionIndex(strip, x, view) }
  }
  const box = pane.getBoundingClientRect()
  return { kind: 'pane', anchor, zone: zoneFromPoint((x - box.left) / box.width, (y - box.top) / box.height) }
}

function edgeAt(rect: DOMRect, x: number, y: number): Exclude<Zone, 'center'> | null {
  if (x - rect.left <= EDGE) return 'left'
  if (rect.right - x <= EDGE) return 'right'
  if (y - rect.top <= EDGE) return 'top'
  if (rect.bottom - y <= EDGE) return 'bottom'
  return null
}

function insertionIndex(strip: HTMLElement, clientX: number, dragged: string) {
  const tabs = [...strip.querySelectorAll<HTMLElement>('[data-tab]')].filter((tab) => tab.dataset.tab !== dragged)
  for (let index = 0; index < tabs.length; index += 1) {
    const box = tabs[index].getBoundingClientRect()
    if (clientX < box.left + box.width / 2) return index
  }
  return tabs.length
}

function activateDoc(doc: LayoutDoc, view: string): LayoutDoc {
  if (!views(doc.layout).includes(view)) return doc
  return { ...doc, layout: activate(doc.layout, view), focus: view }
}

function titleOf(list: DockView[], id: string) {
  const found = list.find((view) => view.id === id)
  if (!found) return copy.missingViewTab
  const title = found.title.trim()
  if (!title || looksLikeRawViewId(title)) return copy.missingViewTab
  return viewDisplayTitle(title)
}

function zoneLabel(zone: Zone) {
  if (zone === 'left') return copy.dockLeft
  if (zone === 'right') return copy.dockRight
  if (zone === 'top') return copy.dockTop
  if (zone === 'bottom') return copy.dockBottom
  return copy.addAsTab
}

function previewStyle(zone: Zone): React.CSSProperties {
  const inset = PREVIEW_INSET
  if (zone === 'left') return { left: inset, top: inset, width: `calc(50% - ${inset * 2}px)`, height: `calc(100% - ${inset * 2}px)` }
  if (zone === 'right') return { left: `calc(50% + ${inset}px)`, top: inset, width: `calc(50% - ${inset * 2}px)`, height: `calc(100% - ${inset * 2}px)` }
  if (zone === 'top') return { left: inset, top: inset, width: `calc(100% - ${inset * 2}px)`, height: `calc(50% - ${inset * 2}px)` }
  if (zone === 'bottom') return { left: inset, top: `calc(50% + ${inset}px)`, width: `calc(100% - ${inset * 2}px)`, height: `calc(50% - ${inset * 2}px)` }
  return { left: inset, top: inset, width: `calc(100% - ${inset * 2}px)`, height: `calc(100% - ${inset * 2}px)` }
}

/** Preview of the pane `dockEdge` will create: `EDGE_SHARE` of the dock, after the 6px split gap, then the same 4px inset. */
function edgePreviewStyle(zone: Exclude<Zone, 'center'>): React.CSSProperties {
  const inset = PREVIEW_INSET
  const span = `calc((100% - ${SPLIT_GAP}px) * ${EDGE_SHARE} - ${inset * 2}px)`
  const cross = `calc(100% - ${inset * 2}px)`
  const start = `calc((100% - ${SPLIT_GAP}px) * ${1 - EDGE_SHARE} + ${SPLIT_GAP}px + ${inset}px)`
  if (zone === 'left') return { left: inset, top: inset, width: span, height: cross }
  if (zone === 'right') return { left: start, top: inset, width: span, height: cross }
  if (zone === 'top') return { left: inset, top: inset, width: cross, height: span }
  return { left: inset, top: start, width: cross, height: span }
}

function asRefs(list: DockView[]): ViewRef[] {
  return list.map((view) => ({ id: view.id, title: view.title, type: view.type }))
}

function cellKey(path: number[], index: number, node: Node) {
  const ids = views(node)
  if (ids.length > 0) return ids.slice().sort().join('+')
  return `${path.join('.')}:${index}:empty`
}
