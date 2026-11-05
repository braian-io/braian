import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { copy } from './i18n'
import {
  commandTitle,
  commandsForContext,
  runCommand,
  type CommandTarget,
  type MenuContext,
  type RegistryCommand,
} from './command-registry'
const textEntrySelector =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]'

export function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(textEntrySelector))
}

export function hasSelectedText(target: EventTarget | null): boolean {
  if (typeof window === 'undefined' || !(target instanceof Node)) return false
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString()) return false
  const node = selection.anchorNode
  return Boolean(node && (target === node || target.contains(node)))
}

/** Text fields and selected text keep the browser's own context menu. */
export function prefersNativeContextMenu(target: EventTarget | null): boolean {
  return isTextEntryTarget(target) || hasSelectedText(target)
}

export type OpenMenuRequest = {
  context: MenuContext
  target?: CommandTarget
  x: number
  y: number
  extra?: RegistryCommand[]
  /** When set, only `extra` items are shown (surface-specific menus). */
  extraOnly?: boolean
}

export const OPEN_CONTEXT_MENU = 'braian:open-context-menu'

export function openSharedContextMenu(request: OpenMenuRequest) {
  // Header/cell right-click must win over an open Ctrl+K palette.
  window.dispatchEvent(new Event('braian-close-palette'))

  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_CONTEXT_MENU, { detail: request }))
}

export function handleSurfaceContextMenu(
  event: ReactMouseEvent,
  context: MenuContext,
  target: CommandTarget = {},
  extra?: RegistryCommand[],
) {
  if (event.defaultPrevented || prefersNativeContextMenu(event.target)) return
  event.preventDefault()
  event.stopPropagation()
  openSharedContextMenu({ context, target, x: event.clientX, y: event.clientY, extra })
}

function clamp(x: number, y: number) {
  const width = typeof window === 'undefined' ? 0 : window.innerWidth
  const height = typeof window === 'undefined' ? 0 : window.innerHeight
  return {
    x: Math.max(8, Math.min(x, width > 0 ? width - 240 : x)),
    y: Math.max(8, Math.min(y, height > 0 ? height - 160 : y)),
  }
}

function uniqueCommands(items: RegistryCommand[]): RegistryCommand[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function itemsFor(request: OpenMenuRequest): RegistryCommand[] {
  if (request.extraOnly) return uniqueCommands([...(request.extra ?? [])])
  const target = request.target ?? {}
  const base = commandsForContext(request.context, target)
  return uniqueCommands([...base, ...(request.extra ?? [])])
}

export function SharedContextMenuHost({
  feedbackEnabled,
}: {
  feedbackEnabled?: boolean
} = {}) {
  const [request, setRequest] = useState<OpenMenuRequest | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [typeahead, setTypeahead] = useState('')
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const feedbackRef = useRef(feedbackEnabled)
  feedbackRef.current = feedbackEnabled

  useEffect(() => {
    const open = (detail: OpenMenuRequest) => {
      restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setTypeahead('')
      setHighlighted(null)
      const point = clamp(detail.x, detail.y)
      const target = { ...(detail.target ?? {}), feedbackEnabled: Boolean(feedbackRef.current) }
      setRequest({ ...detail, target, x: point.x, y: point.y })
    }
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenMenuRequest>).detail
      if (!detail) return
      open(detail)
    }
    window.addEventListener(OPEN_CONTEXT_MENU, onOpen)
    return () => {
      window.removeEventListener(OPEN_CONTEXT_MENU, onOpen)
    }
  }, [])

  const items = useMemo(() => (request ? itemsFor(request) : []), [request])

  const close = () => {
    setRequest(null)
    setTypeahead('')
    setHighlighted(null)
    const el = restoreFocus.current
    restoreFocus.current = null
    queueMicrotask(() => el?.focus())
  }

  useLayoutEffect(() => {
    if (!request) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-testid="context-menu"]')
      ) {
        return
      }
      close()
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [request, items])

  const activate = (command: RegistryCommand) => {
    const target = request?.target ?? {}
    close()
    void runCommand(command.id, target)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    // Arrow keys continue from the marked item, even when DOM focus has not caught up yet.
    const markedAt = highlighted
      ? buttons.findIndex((item) => item.dataset.command === highlighted)
      : -1
    const at = markedAt >= 0 ? markedAt : buttons.findIndex((item) => item === document.activeElement)
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      buttons[at]?.click()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (buttons.length === 0) return
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : event.key === 'ArrowDown'
              ? (at + 1) % buttons.length
              : at <= 0
                ? buttons.length - 1
                : at - 1
      const nextId = buttons[next]?.dataset.command
      if (nextId) setHighlighted(nextId)
      buttons[next]?.focus()
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const next = typeahead + event.key.toLowerCase()
      setTypeahead(next)
      const match = buttons.find((button) => (button.textContent ?? '').toLowerCase().startsWith(next))
      match?.focus()
    }
  }

  if (!request || items.length === 0) return null
  const point = clamp(request.x, request.y)
  const marked = highlighted ?? items[0]?.id ?? null
  return (
    <div
      ref={menuRef}
      className="menu"
      role="menu"
      data-testid="context-menu"
      aria-label={(request.target?.columnHeader as string | undefined) || copy.contextMenu}
      style={{ left: point.x, top: point.y }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {items.map((command) => (
        <button
          key={command.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={command.danger ? 'danger' : undefined}
          data-command={command.id}
          data-highlighted={marked === command.id ? '' : undefined}
          onFocus={() => setHighlighted(command.id)}
          onMouseEnter={(event) => {
            setHighlighted(command.id)
            event.currentTarget.focus({ preventScroll: true })
          }}
          onClick={() => activate(command)}
        >
          <span className="menu-label">{commandTitle(command, request.target ?? {})}</span>
          {command.kbd ? <>{' '}<kbd>{command.kbd}</kbd></> : null}
        </button>
      ))}
    </div>
  )
}
