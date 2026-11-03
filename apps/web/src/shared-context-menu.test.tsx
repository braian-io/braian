// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
})
