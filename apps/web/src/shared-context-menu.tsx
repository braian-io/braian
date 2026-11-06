import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from './components/ui/button'
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

/** Gap between the anchor (pointer or row bottom) and the menu edge. */
const MENU_GAP = 4
const MENU_MIN_MARGIN = 8
const MENU_FALLBACK_WIDTH = 240
const MENU_FALLBACK_HEIGHT = 160

/** Place a fixed menu just below/right of (x, y), flipping when it would leave the viewport. */
export function placeContextMenu(
  x: number,
  y: number,
  menuWidth = MENU_FALLBACK_WIDTH,
  menuHeight = MENU_FALLBACK_HEIGHT,
) {
  const vw = typeof window === 'undefined' ? 0 : window.innerWidth
  const vh = typeof window === 'undefined' ? 0 : window.innerHeight
  let left = x + MENU_GAP
  let top = y + MENU_GAP
  if (vh > 0 && top + menuHeight > vh - MENU_MIN_MARGIN) {
    top = Math.max(MENU_MIN_MARGIN, y - menuHeight - MENU_GAP)
  }
  if (vw > 0 && left + menuWidth > vw - MENU_MIN_MARGIN) {
    left = Math.max(MENU_MIN_MARGIN, x - menuWidth - MENU_GAP)
  }
  left = Math.max(MENU_MIN_MARGIN, vw > 0 ? Math.min(left, vw - Math.min(menuWidth, vw - MENU_MIN_MARGIN)) : left)
  top = Math.max(MENU_MIN_MARGIN, vh > 0 ? Math.min(top, vh - Math.min(menuHeight, vh - MENU_MIN_MARGIN)) : top)
  return { x: left, y: top }
}

function clamp(x: number, y: number) {
  return placeContextMenu(x, y)
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

function commandHasChildren(command: RegistryCommand): boolean {
  return Boolean(command.children && command.children.length > 0)
}

export function SharedContextMenuHost({
  feedbackEnabled,
}: {
  feedbackEnabled?: boolean
} = {}) {
  const [request, setRequest] = useState<OpenMenuRequest | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const submenuRef = useRef<HTMLDivElement | null>(null)
  const parentRefs = useRef(new Map<string, HTMLButtonElement>())
  const [typeahead, setTypeahead] = useState('')
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const [submenuPos, setSubmenuPos] = useState<{ left: number; top: number } | null>(null)
  const suppressOpenOnFocus = useRef(false)
  const feedbackRef = useRef(feedbackEnabled)
  feedbackRef.current = feedbackEnabled

  useEffect(() => {
    const open = (detail: OpenMenuRequest) => {
      restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setTypeahead('')
      setHighlighted(null)
      setOpenSubmenu(null)
      setSubmenuPos(null)
      const target = { ...(detail.target ?? {}), feedbackEnabled: Boolean(feedbackRef.current) }
      // Keep the raw anchor; placeContextMenu runs for paint and after measure.
      setRequest({ ...detail, target, x: detail.x, y: detail.y })
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
  const submenuParent = openSubmenu ? items.find((item) => item.id === openSubmenu) : undefined
  const submenuItems = submenuParent?.children ?? []

  const close = () => {
    setRequest(null)
    setTypeahead('')
    setHighlighted(null)
    setOpenSubmenu(null)
    setSubmenuPos(null)
    const el = restoreFocus.current
    restoreFocus.current = null
    queueMicrotask(() => el?.focus())
  }

  const closeSubmenu = () => {
    setOpenSubmenu(null)
    setSubmenuPos(null)
  }

  const openFlyout = (commandId: string) => {
    const command = items.find((item) => item.id === commandId)
    if (!command || !commandHasChildren(command)) {
      closeSubmenu()
      return
    }
    setOpenSubmenu(commandId)
  }

  useLayoutEffect(() => {
    if (!request) return
    const menu = menuRef.current
    if (menu) {
      const size = menu.getBoundingClientRect()
      const next = placeContextMenu(request.x, request.y, size.width, size.height)
      menu.style.left = `${next.x}px`
      menu.style.top = `${next.y}px`
    }
    menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-testid="context-menu"], [data-testid="context-submenu"]')
      ) {
        return
      }
      close()
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [request, items])

  useLayoutEffect(() => {
    if (!openSubmenu) {
      setSubmenuPos(null)
      return
    }
    const parent = parentRefs.current.get(openSubmenu)
    const submenu = submenuRef.current
    if (!parent || !submenu) return
    const box = parent.getBoundingClientRect()
    const width = submenu.offsetWidth || 200
    const height = submenu.offsetHeight || 40
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = box.right + 4
    if (left + width > vw - 8) left = Math.max(8, box.left - width - 4)
    let top = box.top
    if (top + height > vh - 8) top = Math.max(8, vh - height - 8)
    setSubmenuPos({ left, top })
    const first = submenu.querySelector<HTMLElement>('[role="menuitem"]')
    if (first && document.activeElement?.closest('[data-testid="context-submenu"]') == null) {
      // Keep focus on parent until ArrowRight / Enter moves it; only reposition.
    }
  }, [openSubmenu, submenuItems])

  const activate = (command: RegistryCommand) => {
    if (commandHasChildren(command)) {
      openFlyout(command.id)
      const parent = parentRefs.current.get(command.id)
      parent?.focus({ preventScroll: true })
      return
    }
    const target = request?.target ?? {}
    close()
    void runCommand(command.id, target)
  }

  const rootButtons = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]') ?? [])
  const subButtons = () =>
    Array.from(submenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const focusInSub =
      event.target instanceof Element && Boolean(event.target.closest('[data-testid="context-submenu"]'))
    const highlightInSub = Boolean(highlighted && submenuItems.some((item) => item.id === highlighted))
    const inSubmenu = Boolean(openSubmenu && (focusInSub || highlightInSub))
    const buttons = inSubmenu ? subButtons() : rootButtons()
    const markedAt = highlighted
      ? buttons.findIndex((item) => item.dataset.command === highlighted)
      : -1
    const at = markedAt >= 0 ? markedAt : buttons.findIndex((item) => item === document.activeElement)

    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape' && openSubmenu) {
        const parentId = openSubmenu
        suppressOpenOnFocus.current = true
        closeSubmenu()
        setHighlighted(parentId)
        parentRefs.current.get(parentId)?.focus({ preventScroll: true })
        queueMicrotask(() => {
          suppressOpenOnFocus.current = false
        })
        return
      }
      close()
      return
    }

    if (event.key === 'ArrowRight') {
      const current = items.find((item) => item.id === (highlighted ?? rootButtons()[at]?.dataset.command))
      if (current && commandHasChildren(current)) {
        event.preventDefault()
        openFlyout(current.id)
        const firstId = current.children?.[0]?.id
        if (firstId) setHighlighted(firstId)
        requestAnimationFrame(() => {
          const first = subButtons()[0]
          first?.focus({ preventScroll: true })
        })
      }
      return
    }

    if (event.key === 'ArrowLeft') {
      if (openSubmenu) {
        event.preventDefault()
        const parentId = openSubmenu
        suppressOpenOnFocus.current = true
        closeSubmenu()
        setHighlighted(parentId)
        parentRefs.current.get(parentId)?.focus({ preventScroll: true })
        queueMicrotask(() => {
          suppressOpenOnFocus.current = false
        })
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const id = highlighted ?? buttons[at]?.dataset.command
      if (!id) return
      if (inSubmenu) {
        const child = submenuItems.find((item) => item.id === id)
        if (child) activate(child)
        return
      }
      const command = items.find((item) => item.id === id)
      if (!command) return
      if (commandHasChildren(command)) {
        openFlyout(command.id)
        const firstId = command.children?.[0]?.id
        if (firstId) setHighlighted(firstId)
        requestAnimationFrame(() => {
          const first = subButtons()[0]
          first?.focus({ preventScroll: true })
        })
        return
      }
      activate(command)
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
      if (nextId) {
        setHighlighted(nextId)
        if (!inSubmenu) {
          const nextCommand = items.find((item) => item.id === nextId)
          if (nextCommand && commandHasChildren(nextCommand)) openFlyout(nextId)
          else closeSubmenu()
        }
      }
      buttons[next]?.focus({ preventScroll: true })
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

  const renderItem = (
    command: RegistryCommand,
    opts: {
      markedId: string | null
      inSubmenu: boolean
      setParentRef?: (el: HTMLButtonElement | null) => void
    },
  ) => {
    const hasKids = commandHasChildren(command)
    const isMarked = opts.markedId === command.id
    return (
      <Button
        key={command.id}
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={command.danger ? 'danger' : undefined}
        data-command={command.id}
        data-highlighted={isMarked ? '' : undefined}
        data-open={hasKids && openSubmenu === command.id ? '' : undefined}
        aria-haspopup={hasKids ? 'menu' : undefined}
        aria-expanded={hasKids ? openSubmenu === command.id : undefined}
        ref={opts.setParentRef}
        onFocus={() => {
          setHighlighted(command.id)
          if (suppressOpenOnFocus.current) return
          if (!opts.inSubmenu && hasKids) openFlyout(command.id)
          if (!opts.inSubmenu && !hasKids) closeSubmenu()
        }}
        onMouseEnter={(event) => {
          setHighlighted(command.id)
          event.currentTarget.focus({ preventScroll: true })
          if (!opts.inSubmenu && hasKids) openFlyout(command.id)
          if (!opts.inSubmenu && !hasKids) closeSubmenu()
        }}
        onClick={() => activate(command)}
      >
        <span className="menu-label">{commandTitle(command, request.target ?? {})}</span>
        {hasKids ? <ChevronRight size={14} aria-hidden="true" className="menu-chevron" /> : null}
        {command.kbd ? <>{' '}<kbd>{command.kbd}</kbd></> : null}
      </Button>
    )
  }

  return (
    <>
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
        {items.map((command) =>
          renderItem(command, {
            markedId: submenuItems.some((c) => c.id === marked) ? null : marked,
            inSubmenu: false,
            setParentRef: (el) => {
              if (el) parentRefs.current.set(command.id, el)
              else parentRefs.current.delete(command.id)
            },
          }),
        )}
      </div>
      {openSubmenu && submenuItems.length > 0 ? (
        <div
          ref={submenuRef}
          className="menu menu-submenu"
          role="menu"
          data-testid="context-submenu"
          aria-label={commandTitle(submenuParent!, request.target ?? {})}
          style={submenuPos ? { left: submenuPos.left, top: submenuPos.top } : { visibility: 'hidden', left: 0, top: 0 }}
          onKeyDown={onKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {submenuItems.map((command) =>
            renderItem(command, {
              markedId: marked,
              inSubmenu: true,
            }),
          )}
        </div>
      ) : null}
    </>
  )
}
