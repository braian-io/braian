export type AgentFocusRequest = {
  /** Pane Esc moved to, when a pane sits to the left. Null when there is none. */
  leftPaneId: string | null
  /** Pane the layout focused after the command, used when the opener is gone. */
  preferredPaneId: string | null
}

type Hint = {
  id: string
  testId: string
  role: string
  paneId: string
}

type Memory = {
  element: HTMLElement | null
  paneId: string | null
  /** Enough to find the control again after the dock reparents its pane. */
  hint: Hint
}

const emptyHint: Hint = { id: '', testId: '', role: '', paneId: '' }

const memory: Memory = { element: null, paneId: null, hint: { ...emptyHint } }
let release = false

export function resetAgentFocusForTests() {
  memory.element = null
  memory.paneId = null
  memory.hint = { ...emptyHint }
  release = false
}

/** Remember the focused element before the agent input takes it. Later focuses inside the agent do not replace it. */
export function captureAgentOpener() {
  if (typeof document === 'undefined') return
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return
  if (active === document.body || active === document.documentElement) return
  if (active.closest('[data-testid="agent-view"], [data-testid="command-palette"]')) return
  const pane = active.closest('section.pane')
  const paneId = pane?.getAttribute('data-pane') ?? null
  const dockFocus = document.querySelector('[data-testid="dock"]')?.getAttribute('data-focus') || null
  const agentPane = paneId
    ? document.querySelector(`[data-tab="${cssEscape(paneId)}"]`)?.getAttribute('data-view-type') === 'agent'
    : false
  memory.element = active
  memory.paneId = !agentPane && paneId ? paneId : dockFocus && dockFocus !== paneId ? dockFocus : paneId
  memory.hint = {
    id: active.id,
    testId: active.getAttribute('data-testid') ?? '',
    role: active.getAttribute('role') ?? '',
    paneId: paneId ?? '',
  }
}

export function markAgentFocusRelease() {
  release = true
}

export function consumeAgentFocusRelease() {
  const value = release
  release = false
  return value
}

export type FocusPick = 'left-pane' | 'previous' | 'last-pane' | 'preferred-pane' | 'any-pane'

/** Where focus goes when the agent closes or Esc releases it. Never `body`. */
export function pickAgentFocusRestore(input: {
  leftPane: boolean
  previous: boolean
  lastPane: boolean
  preferredPane: boolean
  anyPane: boolean
}): FocusPick | null {
  if (input.leftPane) return 'left-pane'
  if (input.previous) return 'previous'
  if (input.lastPane) return 'last-pane'
  if (input.preferredPane) return 'preferred-pane'
  if (input.anyPane) return 'any-pane'
  return null
}

function cssEscape(value: string) {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"')
}

function paneElement(id: string | null): HTMLElement | null {
  if (!id || typeof document === 'undefined') return null
  const node = document.querySelector(`section.pane[data-pane="${cssEscape(id)}"]`)
  return node instanceof HTMLElement && node.isConnected ? node : null
}

function outsideAgent(node: HTMLElement) {
  return !node.closest('[data-testid="agent-view"], [data-testid="command-palette"]')
}

/** The dock moves a pane into a split when the agent opens, which replaces the node. */
function replacementElement(): HTMLElement | null {
  const hint = memory.hint
  const pane = paneElement(hint.paneId)
  const scope = pane ?? document
  const pick = (selector: string) => {
    const node = scope.querySelector(selector)
    return node instanceof HTMLElement && node.isConnected && outsideAgent(node) ? node : null
  }
  if (hint.id) {
    const node = document.getElementById(hint.id)
    if (node instanceof HTMLElement && node.isConnected && outsideAgent(node)) return node
  }
  if (hint.testId) {
    const found = pick(`[data-testid="${cssEscape(hint.testId)}"]`)
    if (found) return found
  }
  if (hint.role) {
    const found = pick(`[role="${cssEscape(hint.role)}"]`)
    if (found) return found
  }
  return null
}

function previousElement(): HTMLElement | null {
  const node = memory.element
  if (node?.isConnected && outsideAgent(node)) return node
  return replacementElement()
}

/** Move focus back. Returns the element that received it, or null when nothing focusable remains. */
export function restoreAgentFocus(request: AgentFocusRequest): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const left = paneElement(request.leftPaneId)
  const previous = previousElement()
  const last = paneElement(memory.paneId)
  const preferred = paneElement(request.preferredPaneId)
  const panes = [...document.querySelectorAll('section.pane')].filter(
    (node): node is HTMLElement => node instanceof HTMLElement && node.isConnected,
  )
  const pick = pickAgentFocusRestore({
    leftPane: Boolean(left),
    previous: Boolean(previous),
    lastPane: Boolean(last),
    preferredPane: Boolean(preferred),
    anyPane: panes.length > 0,
  })
  const target =
    pick === 'left-pane' ? left
    : pick === 'previous' ? previous
    : pick === 'last-pane' ? last
    : pick === 'preferred-pane' ? preferred
    : pick === 'any-pane' ? (panes[0] ?? null)
    : null
  if (target && document.activeElement !== target) target.focus()
  return target
}
