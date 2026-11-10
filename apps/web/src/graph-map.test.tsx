// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import {
  canOpenGraphNodeMenu,
  GraphMap,
  graphNodeMenuExtras,
  graphNodeTarget,
  nodeMenuAnchor,
  openGraphNodeMenu,
} from './graph-map'
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
  it('gives a model type only type actions, never object link choices', () => {
    const product = graphNodeMenuExtras(defs, { kind: 'type', typeKey: 'product', caption: 'Product' })
    expect(product.map((extra) => extra.id)).toEqual(['graph:type:view'])
    expect(product[0]?.title).toBe('Open Product')
    expect(product[0]?.contexts).toEqual(['graph-node'])

    const supplier = graphNodeMenuExtras(defs, { kind: 'type', typeKey: 'supplier', caption: 'Supplier' })
    const article = graphNodeMenuExtras(defs, { kind: 'type', typeKey: 'article', caption: 'Article' })
    expect(supplier[0]?.title).toBe('Open Supplier')
    expect(article[0]?.title).toBe('Open Article')
    expect(product[0]?.title).not.toBe(supplier[0]?.title)
  })

  it('keeps link choices on object nodes', () => {
    const extras = graphNodeMenuExtras(defs, { kind: 'object', typeKey: 'product', caption: 'Product' })
    expect(extras.map((extra) => extra.id)).toEqual(['graph:add-link:product_articles'])
    expect(extras[0]?.title).toBe('Articles')
    expect(extras[0]?.contexts).toEqual(['graph-node'])
  })

  it('leaves object nodes without link choices empty', () => {
    expect(graphNodeMenuExtras(defs, { kind: 'object', typeKey: 'supplier', caption: 'Supplier' })).toEqual([])
  })
})

describe('node menu anchor', () => {
  it('anchors at the visible node marker, not an off-screen button', () => {
    expect(nodeMenuAnchor({ x: 120, y: 240, r: 30 }, { x: 8, y: 8 })).toEqual({ x: 150, y: 270 })
  })

  it('falls back to the visible canvas when no marker is published', () => {
    expect(nodeMenuAnchor(undefined, { x: 400, y: 300 })).toEqual({ x: 400, y: 300 })
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
    expect(within(menu).getAllByRole('menuitem').length).toBe(1)
    expect(within(menu).getByRole('menuitem').textContent).toBe('Open Product')
  })

  it('Shift+F10 and the ContextMenu key open the same shared menu', () => {
    renderModelGraph()
    fireEvent.keyDown(typeNode(), { key: 'F10', shiftKey: true })
    expect(screen.getByTestId('context-menu')).toBeTruthy()
    cleanup()
    renderModelGraph()
    fireEvent.keyDown(typeNode(), { key: 'ContextMenu' })
    expect(screen.getByTestId('context-menu')).toBeTruthy()
  })

  it('clicking a type node menu item opens that type and does not write', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const opened: string[] = []
    const onOpen = (event: Event) => opened.push(String((event as CustomEvent<{ key?: string }>).detail?.key ?? ''))
    window.addEventListener('braian-open-model-type', onOpen)
    try {
      renderModelGraph()
      fireEvent.contextMenu(typeNode(), { clientX: 40, clientY: 40 })
      const menu = screen.getByTestId('context-menu')
      fireEvent.click(within(menu).getAllByRole('menuitem')[0])
      expect(opened).toEqual(['product'])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('braian-open-model-type', onOpen)
    }
  })

  it('an object node link entry opens the add-link dialog for that link type', () => {
    const added: string[] = []
    const onAdd = (event: Event) =>
      added.push(String((event as CustomEvent<{ linkType?: string }>).detail?.linkType ?? ''))
    window.addEventListener('braian-add-link', onAdd)
    try {
      renderModelGraph()
      act(() => {
        openGraphNodeMenu({ kind: 'object', id: 'obj-1', typeKey: 'product', caption: 'Product' }, defs, 10, 10)
      })
      const menu = screen.getByTestId('context-menu')
      expect(within(menu).getByRole('menuitem').textContent).toBe('Articles')
      fireEvent.click(within(menu).getAllByRole('menuitem')[0])
      expect(added).toEqual(['product_articles'])
    } finally {
      window.removeEventListener('braian-add-link', onAdd)
    }
  })

  it('empty canvas right-click does not open a menu', () => {
    renderModelGraph()
    fireEvent.contextMenu(screen.getByTestId('graph-stage'), { clientX: 5, clientY: 5 })
    expect(screen.queryByTestId('context-menu')).toBeNull()
  })
})
