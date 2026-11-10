// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import { canOpenGraphNodeMenu, GraphMap, graphNodeMenuExtras, graphNodeTarget } from './graph-map'
import { SharedContextMenuHost } from './shared-context-menu'

const defs: Json = {
  types: [
    { id: 't-product', key: 'product', kind: 'entity', labels: { en: 'Product' } },
    { id: 't-article', key: 'article', kind: 'entity', labels: { en: 'Article' } },
    { id: 't-supplier', key: 'supplier', kind: 'entity', labels: { en: 'Supplier' } },
    {
      id: 'l-product-articles',
      key: 'product_articles',
      kind: 'link',
      labels: { en: 'Product' },
      link: {
        from_types: ['t-product'],
        to_types: ['t-article'],
        from_label: { key: 'product', labels: { en: 'Product' } },
        to_label: { key: 'articles', labels: { en: 'Articles' } },
        from_cardinality: 'one',
        to_cardinality: 'many',
      },
    },
  ],
  structures: [],
}

const stats: Json = { by_type: [{ type: 'product', count: 5 }] }

const globalLabels = ['Search', 'Sign out', 'Light mode', 'Send feedback', 'Open agent', 'Switch catalog', 'Export']

function renderModelGraph() {
  return render(
    <>
      <SharedContextMenuHost />
      <GraphMap model={{ defs, stats }} />
    </>,
  )
}

function typeNode() {
  return screen.getByTestId('graph-nodes').querySelector('[data-node-id="type:product"]') as HTMLElement
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('graph node menu gate', () => {
  it('allows object and model type nodes that carry a type key', () => {
    expect(canOpenGraphNodeMenu({ kind: 'object', typeKey: 'product' })).toBe(true)
    expect(canOpenGraphNodeMenu({ kind: 'type', typeKey: 'product' })).toBe(true)
  })

  it('rejects other kinds and nodes without a type key', () => {
    for (const kind of ['class', 'group', 'value', 'structure'] as const) {
      expect(canOpenGraphNodeMenu({ kind, typeKey: 'product' })).toBe(false)
    }
    expect(canOpenGraphNodeMenu({ kind: 'object' })).toBe(false)
    expect(canOpenGraphNodeMenu({ kind: 'type' })).toBe(false)
  })
})

describe('graph node menu extras', () => {
  it('uses the type link choices for a model type', () => {
    const extras = graphNodeMenuExtras(defs, { kind: 'type', typeKey: 'product', caption: 'Product' })
    expect(extras.map((extra) => extra.id)).toEqual(['graph:add-link:product_articles'])
    expect(extras[0]?.title).toBe('Articles')
    expect(extras[0]?.contexts).toEqual(['graph-node'])
  })

  it('adds a node-scoped fallback for a type without link choices', () => {
    const extras = graphNodeMenuExtras(defs, { kind: 'type', typeKey: 'supplier', caption: 'Supplier' })
    expect(extras).toHaveLength(1)
    expect(extras[0]?.id).toBe('graph:type:view')
    expect(extras[0]?.title).toBe('Open Supplier')
    expect(extras[0]?.contexts).toEqual(['graph-node'])
  })

  it('leaves object nodes without link choices empty', () => {
    expect(graphNodeMenuExtras(defs, { kind: 'object', typeKey: 'supplier', caption: 'Supplier' })).toEqual([])
  })
})

describe('graph node menu target', () => {
  it('never exposes a model type node id as an object id', () => {
    expect(graphNodeTarget({ kind: 'type', id: 'type:product', typeKey: 'product' })).toEqual({ typeKey: 'product' })
    expect(graphNodeTarget({ kind: 'object', id: 'obj-1', typeKey: 'product' })).toEqual({
      objectId: 'obj-1',
      typeKey: 'product',
    })
  })
})

describe('GraphMap model type node menu', () => {
  it('left-click selects the type and opens the inspector', () => {
    renderModelGraph()
    fireEvent.click(typeNode())
    const inspector = screen.getByTestId('graph-inspector')
    expect(inspector.textContent).toContain('Product')
  })

  it('right-click opens the node-scoped shared menu without globals', () => {
    renderModelGraph()
    fireEvent.contextMenu(typeNode(), { clientX: 40, clientY: 40 })
    const menu = screen.getByTestId('context-menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items.length).toBeGreaterThan(0)
    const text = menu.textContent ?? ''
    for (const label of globalLabels) expect(text).not.toContain(label)
  })

  it('Ctrl+Enter opens the same shared menu', () => {
    renderModelGraph()
    fireEvent.keyDown(typeNode(), { key: 'Enter', ctrlKey: true })
    const menu = screen.getByTestId('context-menu')
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(0)
  })

  it('clicking a type node menu item does not write or pass an object id', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const commands: Array<{ id: string; target?: { objectId?: string } }> = []
    const onCommand = (event: Event) => commands.push((event as CustomEvent).detail)
    window.addEventListener('braian:command', onCommand)
    try {
      renderModelGraph()
      fireEvent.contextMenu(typeNode(), { clientX: 40, clientY: 40 })
      const menu = screen.getByTestId('context-menu')
      fireEvent.click(within(menu).getAllByRole('menuitem')[0])
      expect(commands).toHaveLength(1)
      expect(commands[0]?.target?.objectId).toBeUndefined()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('braian:command', onCommand)
    }
  })

  it('empty canvas right-click does not open a menu', () => {
    renderModelGraph()
    fireEvent.contextMenu(screen.getByTestId('graph-stage'), { clientX: 5, clientY: 5 })
    expect(screen.queryByTestId('context-menu')).toBeNull()
  })
})
