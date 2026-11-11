// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { commandsForContext, registerCommandRunner } from './command-registry'
import { SharedContextMenuHost, handleSurfaceContextMenu, openSharedContextMenu, placeContextMenu } from './shared-context-menu'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.getSelection()?.removeAllRanges()
})

const globalIds = [
  'palette:search',
  'feedback:send',
  'theme:toggle',
  'agent:open',
  'session:sign-out',
  'session:reload-new-version',
  'object:new',
  'fields:select',
  'selection:new',
  'model:new-type',
  'model:new-link-type',
  'model:new-list',
  'model:new-family',
  'attr:new',
  'catalog:switch',
  'layout:reset_layout',
  'table:mass-edit',
  'table:filter-by',
  'table:export',
  'table:export-columns',
]

const itemContexts = [
  'row',
  'cell',
  'table-header',
  'group',
  'tab',
  'dock-view',
  'graph-node',
  'assortment',
  'model-type',
  'model-link',
  'model-list',
  'model-family',
  'attribute',
  'link',
] as const

function contextmenu(target: Element, x = 24, y = 32) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

describe('shared context menu registry', () => {
  it('keeps global commands in Ctrl+K only, never in item menus', () => {
    const target = {
      objectId: 'o1',
      column: 'name',
      columnHeader: 'Name',
      groupKey: 'g1',
      workspaceId: 'w1',
      selectionId: 's1',
      typeKey: 't1',
      listKey: 'l1',
      optionCode: 'o1',
      familyKey: 'f1',
      attributeKey: 'a1',
      linkId: 'lk1',
      peerId: 'p1',
      viewId: 'v1',
      viewType: 'object_table',
      feedbackEnabled: true,
    }
    for (const context of itemContexts) {
      const ids = commandsForContext(context, target).map((command) => command.id)
      for (const global of globalIds) expect(ids, `${context} menu`).not.toContain(global)
    }
    expect(commandsForContext('row', target).map((command) => command.id)).toContain('object:open')
  })

  it('shows one Open in the link row menu', () => {
    const target = { linkId: 'lk1', peerId: 'p1', objectId: 'p1' }
    const opens = commandsForContext('link', target).filter((command) => {
      const title = typeof command.title === 'function' ? command.title(target) : command.title
      return title === 'Open'
    })
    expect(opens).toHaveLength(1)
    expect(opens[0]?.id).toBe('object:open')
  })

  it('does not open a custom menu on an empty surface', () => {
    render(<SharedContextMenuHost feedbackEnabled />)
    const surface = document.createElement('div')
    document.body.appendChild(surface)
    const event = contextmenu(surface)
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryByTestId('context-menu')).toBeNull()
  })

  it('leaves text fields and selected text to the browser', () => {
    render(
      <div data-testid="surface" onContextMenu={(event) => handleSurfaceContextMenu(event, 'row', { objectId: 'o1' })}>
        <input data-testid="input" />
        <textarea data-testid="textarea" />
        <div data-testid="editable" contentEditable suppressContentEditableWarning>
          Editable
        </div>
        <p data-testid="text">Selectable text</p>
      </div>,
    )
    for (const id of ['input', 'textarea', 'editable']) {
      expect(contextmenu(screen.getByTestId(id)).defaultPrevented).toBe(false)
    }

    const text = screen.getByTestId('text')
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    expect(contextmenu(text).defaultPrevented).toBe(false)
  })

  it('renders the registry keyboard shortcut next to the item', async () => {
    registerCommandRunner('object:open', () => undefined)
    render(<SharedContextMenuHost />)
    openSharedContextMenu({ context: 'row', x: 20, y: 20, target: { objectId: 'o1' } })
    await screen.findByTestId('context-menu')
    const open = document.querySelector<HTMLElement>('[data-command="object:open"]')
    expect(open?.querySelector('kbd')?.textContent).toBe('Enter')
  })

  it('moves focus with arrow keys', async () => {
    registerCommandRunner('object:open', () => undefined)
    render(<SharedContextMenuHost />)
    openSharedContextMenu({ context: 'row', x: 12, y: 12, target: { objectId: 'o1' } })
    const menu = await screen.findByTestId('context-menu')
    const items = screen.getAllByRole('menuitem')
    expect(items.length).toBeGreaterThan(1)
    items[0].focus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0])
  })

  it('keeps highlight and focus on one item when hovering then arrowing', async () => {
    registerCommandRunner('object:open', () => undefined)
    render(<SharedContextMenuHost />)
    openSharedContextMenu({ context: 'row', x: 12, y: 12, target: { objectId: 'o1' } })
    const menu = await screen.findByTestId('context-menu')
    const items = screen.getAllByRole('menuitem')
    expect(items.length).toBeGreaterThan(2)
    const marked = () => items.filter((item) => item.hasAttribute('data-highlighted'))
    expect(marked()).toEqual([items[0]])

    fireEvent.mouseOver(items[1])
    expect(marked()).toEqual([items[1]])
    expect(document.activeElement).toBe(items[1])

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(marked()).toEqual([items[2]])
    expect(document.activeElement).toBe(items[2])
  })

  it('opens Link to as a flyout with arrow keys', async () => {
    const run = vi.fn()
    registerCommandRunner('link:add:product_articles:out', run)
    render(<SharedContextMenuHost />)
    openSharedContextMenu({
      context: 'row',
      x: 16,
      y: 16,
      extraOnly: true,
      extra: [
        { id: 'object:open', title: 'Open Article', contexts: ['row'] },
        {
          id: 'link:to',
          title: 'Link to',
          contexts: ['row'],
          children: [
            { id: 'link:add:product_articles:out', title: 'Product', contexts: ['row'] },
            { id: 'link:add:supplier_articles:out', title: 'Supplier', contexts: ['row'] },
          ],
        },
      ],
    })
    const menu = await screen.findByTestId('context-menu')
    expect(screen.queryByRole('menuitem', { name: 'Link to Product' })).toBeNull()
    const linkTo = screen.getByRole('menuitem', { name: 'Link to' })
    expect(linkTo.getAttribute('aria-haspopup')).toBe('menu')
    fireEvent.mouseOver(linkTo)
    await screen.findByTestId('context-submenu')
    expect(screen.getByRole('menuitem', { name: 'Product' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Supplier' })).toBeTruthy()
    // Only the parent is highlighted until ArrowRight.
    expect(linkTo.hasAttribute('data-highlighted')).toBe(true)
    expect(screen.getByRole('menuitem', { name: 'Product' }).hasAttribute('data-highlighted')).toBe(false)

    fireEvent.keyDown(menu, { key: 'ArrowRight' })
    const product = screen.getByRole('menuitem', { name: 'Product' })
    await waitFor(() => expect(product.hasAttribute('data-highlighted')).toBe(true))
    expect(linkTo.hasAttribute('data-highlighted')).toBe(false)

    fireEvent.keyDown(screen.getByTestId('context-submenu'), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Supplier' }).hasAttribute('data-highlighted')).toBe(true)

    fireEvent.keyDown(screen.getByTestId('context-submenu'), { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.queryByTestId('context-submenu')).toBeNull())
    expect(linkTo.hasAttribute('data-highlighted')).toBe(true)

    fireEvent.mouseOver(linkTo)
    await screen.findByTestId('context-submenu')
    fireEvent.keyDown(menu, { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByTestId('context-submenu'), { key: 'Enter' })
    expect(run).toHaveBeenCalled()
    expect(screen.queryByTestId('context-menu')).toBeNull()
  })

})
describe('placeContextMenu', () => {
  const width = window.innerWidth
  const height = window.innerHeight
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  })

  it('opens just below and to the right of the anchor', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    const point = placeContextMenu(100, 200, 220, 120)
    expect(point.x).toBeGreaterThan(100)
    expect(point.y).toBeGreaterThan(200)
  })

  it('flips above when there is no room below', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 })
    const point = placeContextMenu(100, 280, 220, 120)
    expect(point.y + 120).toBeLessThanOrEqual(300)
    expect(point.y).toBeLessThan(280)
  })

  it('moves clear of a node near the right edge instead of covering it', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    const avoid = { left: 1214, top: 421, right: 1398, bottom: 487 }
    const point = placeContextMenu(1336, 421, 220, 120, avoid)
    const box = { left: point.x, top: point.y, right: point.x + 220, bottom: point.y + 120 }
    const overlaps = box.left < avoid.right && box.right > avoid.left && box.top < avoid.bottom && box.bottom > avoid.top
    expect(overlaps).toBe(false)
    expect(box.left).toBeGreaterThanOrEqual(8)
    expect(box.right).toBeLessThanOrEqual(1440 - 8)
    expect(box.top).toBeGreaterThanOrEqual(8)
    expect(box.bottom).toBeLessThanOrEqual(900 - 8)
  })

  it('uses the room above or below when neither side fits', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 340 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 })
    const avoid = { left: 100, top: 120, right: 240, bottom: 180 }
    const point = placeContextMenu(250, 120, 220, 80, avoid)
    const box = { left: point.x, top: point.y, right: point.x + 220, bottom: point.y + 80 }
    const overlaps = box.left < avoid.right && box.right > avoid.left && box.top < avoid.bottom && box.bottom > avoid.top
    expect(overlaps).toBe(false)
    expect(box.left).toBeGreaterThanOrEqual(8)
    expect(box.top).toBeGreaterThanOrEqual(8)
    expect(box.right).toBeLessThanOrEqual(340 - 8)
    expect(box.bottom).toBeLessThanOrEqual(300 - 8)
  })

  it('avoids every neighbour circle and label, not only the clicked node', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    const clicked = { left: 1214, top: 421, right: 1398, bottom: 487 }
    const neighbour = { left: 940, top: 440, right: 1180, bottom: 520 }
    const point = placeContextMenu(1336, 421, 220, 120, clicked, [clicked, neighbour])
    const box = { left: point.x, top: point.y, right: point.x + 220, bottom: point.y + 120 }
    for (const rect of [clicked, neighbour]) {
      expect(box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top).toBe(false)
    }
    expect(box.left).toBeGreaterThanOrEqual(8)
    expect(box.top).toBeGreaterThanOrEqual(8)
    expect(box.right).toBeLessThanOrEqual(1440 - 8)
    expect(box.bottom).toBeLessThanOrEqual(900 - 8)
  })

  it('clamps the menu to the given pane bounds, not the viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    const bounds = { left: 100, top: 50, right: 520, bottom: 350 }
    const point = placeContextMenu(500, 340, 220, 120, undefined, undefined, bounds)
    expect(point.x).toBeGreaterThanOrEqual(bounds.left + 8)
    expect(point.y).toBeGreaterThanOrEqual(bounds.top + 8)
    expect(point.x + 220).toBeLessThanOrEqual(bounds.right - 8)
    expect(point.y + 120).toBeLessThanOrEqual(bounds.bottom - 8)
  })

  it('hugs the node inside the bounds when there is free space beside it', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    const bounds = { left: 0, top: 0, right: 600, bottom: 400 }
    const avoid = { left: 280, top: 150, right: 340, bottom: 210 }
    const point = placeContextMenu(300, 150, 180, 90, avoid, [avoid], bounds)
    const gapX = Math.max(point.x - avoid.right, avoid.left - (point.x + 180), 0)
    const gapY = Math.max(point.y - avoid.bottom, avoid.top - (point.y + 90), 0)
    expect(Math.hypot(gapX, gapY)).toBeLessThanOrEqual(16)
    expect(point.x).toBeGreaterThanOrEqual(bounds.left + 8)
    expect(point.y).toBeGreaterThanOrEqual(bounds.top + 8)
    expect(point.x + 180).toBeLessThanOrEqual(bounds.right - 8)
    expect(point.y + 90).toBeLessThanOrEqual(bounds.bottom - 8)
  })

  it('clears a neighbouring label inside the bounds before moving further away', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    const bounds = { left: 0, top: 0, right: 700, bottom: 400 }
    const avoid = { left: 120, top: 120, right: 190, bottom: 180 }
    const label = { left: 198, top: 100, right: 320, bottom: 184 }
    const point = placeContextMenu(140, 120, 200, 100, avoid, [avoid, label], bounds)
    const box = { left: point.x, top: point.y, right: point.x + 200, bottom: point.y + 100 }
    const overlaps = (rect: { left: number; right: number; top: number; bottom: number }) =>
      box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top
    expect(overlaps(avoid)).toBe(false)
    expect(overlaps(label)).toBe(false)
    expect(box.left).toBeGreaterThanOrEqual(bounds.left + 8)
    expect(box.right).toBeLessThanOrEqual(bounds.right - 8)
    expect(box.top).toBeGreaterThanOrEqual(bounds.top + 8)
    expect(box.bottom).toBeLessThanOrEqual(bounds.bottom - 8)
  })

  it('stays at the left margin when the bounds are smaller than the menu', () => {
    const bounds = { left: 10, top: 12, right: 210, bottom: 162 }
    const point = placeContextMenu(80, 80, 220, 120, undefined, undefined, bounds)
    expect(point.x).toBe(bounds.left + 8)
    expect(point.y).toBeGreaterThanOrEqual(bounds.top + 8)
    expect(point.y).toBeLessThanOrEqual(bounds.bottom - 8)
  })

  it('takes the least overlap when no position can clear every node', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 })
    const clicked = { left: 120, top: 140, right: 240, bottom: 200 }
    const wall = { left: 0, top: 0, right: 360, bottom: 360 }
    const point = placeContextMenu(180, 140, 220, 120, clicked, [clicked, wall])
    const box = { left: point.x, top: point.y, right: point.x + 220, bottom: point.y + 120 }
    expect(box.left).toBeGreaterThanOrEqual(8)
    expect(box.top).toBeGreaterThanOrEqual(8)
    expect(box.right).toBeLessThanOrEqual(360 - 8)
    expect(box.bottom).toBeLessThanOrEqual(360 - 8)
  })
})
