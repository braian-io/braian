// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { commandsForContext, registerCommandRunner } from './command-registry'
import { SharedContextMenuHost, handleSurfaceContextMenu, openSharedContextMenu } from './shared-context-menu'

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