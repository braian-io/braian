// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import {
  canOpenGraphNodeMenu,
  clampLabelCenter,
  GraphMap,
  graphNodeMenuExtras,
  graphNodeKey,
  graphNodeTarget,
  nodeMenuAnchor,
  nodeMenuAvoid,
  nodeObstacles,
  openGraphNodeMenu,
  runGraphNodeCommand,
  staysPinnedAfterPointerUp,
  valueNodeObjectId,
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
    {
      id: 'l-supplier-articles',
      key: 'supplier_articles',
      kind: 'link',
      labels: { en: 'Supplier' },
      link: {
        from_types: ['t-supplier'],
        to_types: ['t-article'],
        from_label: { key: 'supplier', labels: { en: 'Supplier' } },
        to_label: { key: 'articles', labels: { en: 'Articles' } },
        from_cardinality: 'many',
        to_cardinality: 'one',
      },
    },
    {
      id: 'l-product-suppliers',
      key: 'product_suppliers',
      kind: 'link',
      labels: { en: 'Product' },
      link: {
        from_types: ['t-product'],
        to_types: ['t-supplier'],
        from_label: { key: 'product', labels: { en: 'Product' } },
        to_label: { key: 'suppliers', labels: { en: 'Suppliers' } },
        from_cardinality: 'many',
        to_cardinality: 'many',
      },
    },
    {
      id: 'l-replaces',
      key: 'replaces',
      kind: 'link',
      labels: { en: 'Replaces' },
      link: {
        from_types: ['t-article'],
        to_types: ['t-article'],
        from_label: { key: 'replaces', labels: { en: 'Replaces' } },
        to_label: { key: 'replaced_by', labels: { en: 'Replaced by' } },
        from_cardinality: 'many',
        to_cardinality: 'one',
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
  it('allows object, model type, value and structure nodes', () => {
    expect(canOpenGraphNodeMenu({ kind: 'object', typeKey: 'product' })).toBe(true)
    expect(canOpenGraphNodeMenu({ kind: 'type', typeKey: 'product' })).toBe(true)
    expect(canOpenGraphNodeMenu({ kind: 'value' })).toBe(true)
    expect(canOpenGraphNodeMenu({ kind: 'group' })).toBe(true)
    expect(canOpenGraphNodeMenu({ kind: 'class' })).toBe(true)
    expect(canOpenGraphNodeMenu({ kind: 'structure' })).toBe(true)
  })

  it('rejects object and type nodes without a type key', () => {
    expect(canOpenGraphNodeMenu({ kind: 'object' })).toBe(false)
    expect(canOpenGraphNodeMenu({ kind: 'type' })).toBe(false)
  })
})

describe('pin on pointer up', () => {
  it('keeps an existing pin through a click and a drag', () => {
    expect(staysPinnedAfterPointerUp(true, false)).toBe(true)
    expect(staysPinnedAfterPointerUp(true, true)).toBe(true)
    expect(staysPinnedAfterPointerUp(true, false, true)).toBe(true)
  })

  it('pins a dragged node and leaves a clicked unpinned node alone', () => {
    expect(staysPinnedAfterPointerUp(false, false)).toBe(false)
    expect(staysPinnedAfterPointerUp(false, true)).toBe(true)
    // The model graph keeps its old drag behaviour, but never silently drops
    // an existing pin.
    expect(staysPinnedAfterPointerUp(false, true, true)).toBe(false)
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

  it('labels object link choices as verbs and keeps the direction', () => {
    const product = graphNodeMenuExtras(defs, { kind: 'object', typeKey: 'product', caption: 'Product' })
    expect(product.map((extra) => extra.id)).toEqual([
      'graph:add-link:product_articles:out',
      'graph:add-link:product_suppliers:out',
    ])
    expect(product.map((extra) => extra.title)).toEqual(['Link Articles…', 'Link Suppliers…'])
    expect(product.every((extra) => extra.contexts.includes('graph-node'))).toBe(true)
  })

  it('uses the incoming relation label and direction for an article', () => {
    const extras = graphNodeMenuExtras(defs, { kind: 'object', typeKey: 'article', caption: 'Article' })
    expect(extras.map((extra) => extra.id)).toEqual([
      'graph:add-link:product_articles:in',
      'graph:add-link:supplier_articles:in',
      'graph:add-link:replaces:out',
      'graph:add-link:replaces:in',
    ])
    expect(extras.map((extra) => extra.title)).toEqual([
      'Link Product…',
      'Link Supplier…',
      'Link Replaced by…',
      'Link Replaces…',
    ])
  })

  it('gives article, product and supplier nodes menus from their own type, and they differ', () => {
    const article = graphNodeMenuExtras(defs, { kind: 'object', typeKey: 'article', caption: 'Article' })
    const product = graphNodeMenuExtras(defs, { kind: 'object', typeKey: 'product', caption: 'Product' })
    const supplier = graphNodeMenuExtras(defs, { kind: 'object', typeKey: 'supplier', caption: 'Supplier' })
    const titles = (items: typeof article) => items.map((item) => typeof item.title === 'string' ? item.title : '')
    expect(titles(article)).toEqual(['Link Product…', 'Link Supplier…', 'Link Replaced by…', 'Link Replaces…'])
    expect(titles(product)).toEqual(['Link Articles…', 'Link Suppliers…'])
    expect(titles(supplier)).toEqual(['Link Articles…', 'Link Product…'])
    expect(titles(article)).not.toEqual(titles(product))
    expect(titles(product)).not.toEqual(titles(supplier))
    expect(titles(article)).not.toEqual(titles(supplier))
    expect(titles(supplier).some((title) => /supplier of product/i.test(title))).toBe(false)
  })

  it('gives a value node its own open-value action, not Product links', () => {
    const value = graphNodeMenuExtras(defs, { kind: 'value', typeKey: 'product', caption: 'Storage' })
    expect(value.map((extra) => extra.id)).toEqual(['graph:value:open'])
    expect(value[0]?.title).toBe('Open value')
    expect(value.every((extra) => extra.contexts.includes('graph-node'))).toBe(true)
  })

  it('leaves object nodes without link choices empty', () => {
    expect(graphNodeMenuExtras(defs, { kind: 'object', typeKey: 'unknown', caption: 'Unknown' })).toEqual([])
  })

  it('gives a group its own show-members action, not the canvas menu', () => {
    const group = graphNodeMenuExtras(defs, { kind: 'group', caption: 'Chocolate' })
    expect(group.map((extra) => extra.id)).toEqual(['graph:node:expand'])
    expect(group[0]?.title).toBe('Show members')
    expect(group[0]?.contexts).toEqual(['graph-node'])
    expect(group.map((extra) => extra.id)).not.toContain('graph:canvas:fit')
  })

  it('gives class and structure nodes their expand action', () => {
    expect(graphNodeMenuExtras(defs, { kind: 'class', caption: 'Cocoa' }).map((extra) => extra.id)).toEqual([
      'graph:node:expand',
    ])
    expect(graphNodeMenuExtras(defs, { kind: 'class', caption: 'Cocoa' })[0]?.title).toBe('Expand')
    expect(graphNodeMenuExtras(defs, { kind: 'structure', caption: 'Food' }).map((extra) => extra.id)).toEqual([
      'graph:node:expand',
    ])
  })
})

describe('node menu anchor', () => {
  it('anchors beside the visible node marker so the node label stays clear', () => {
    expect(nodeMenuAnchor({ x: 120, y: 240, r: 30 }, { x: 8, y: 8 })).toEqual({ x: 158, y: 210 })
  })

  it('falls back to the visible canvas when no marker is published', () => {
    expect(nodeMenuAnchor(undefined, { x: 400, y: 300 })).toEqual({ x: 400, y: 300 })
  })

  it('builds an exclusion rectangle around the circle and its caption', () => {
    expect(nodeMenuAvoid({ x: 1306, y: 443, r: 22 }, 'Dark chocolate 70% 100 g')).toEqual({
      left: 1306 - Math.max(44, 'Dark chocolate 70% 100 g'.length * 7 + 16) / 2,
      top: 421,
      right: 1306 + Math.max(44, 'Dark chocolate 70% 100 g'.length * 7 + 16) / 2,
      bottom: 487,
    })
    expect(nodeMenuAvoid(undefined, 'x')).toBeUndefined()
  })

  it('uses the measured, edge-clamped label box when the canvas has published one', () => {
    expect(nodeMenuAvoid(
      { x: 1306, y: 443, r: 22, label: { left: 1150, top: 467, right: 1436, bottom: 483 } },
      'Dark chocolate 70% 100 g',
    )).toEqual({ left: 1150, top: 421, right: 1436, bottom: 483 })
  })

  it('keeps a label inside the pane instead of clipping it at the edge', () => {
    expect(clampLabelCenter(1400, 220, 1440)).toBe(1326)
    expect(clampLabelCenter(20, 220, 1440)).toBe(114)
    expect(clampLabelCenter(600, 220, 1440)).toBe(600)
  })

  it('lists every visible circle and label as a menu obstacle', () => {
    expect(nodeObstacles({
      a: { x: 100, y: 100, r: 20, label: { left: 60, top: 124, right: 140, bottom: 140 } },
      b: { x: 300, y: 200, r: 10 },
    })).toEqual([
      { left: 80, top: 80, right: 120, bottom: 120 },
      { left: 60, top: 124, right: 140, bottom: 140 },
      { left: 290, top: 190, right: 310, bottom: 210 },
    ])
  })
})

describe('graph node menu target', () => {
  it('never exposes a model type node id as an object id', () => {
    expect(graphNodeTarget({ kind: 'type', id: 'type:product', typeKey: 'product' })).toEqual({ typeKey: 'product' })
    expect(graphNodeTarget({ kind: 'object', id: 'object:obj-1', objectId: 'obj-1', typeKey: 'product' })).toEqual({
      objectId: 'obj-1',
      typeKey: 'product',
    })
    expect(graphNodeTarget({ kind: 'object', id: 'obj-1', typeKey: 'product' })).toEqual({
      objectId: 'obj-1',
      typeKey: 'product',
    })
  })

  it('maps a value node to the object that owns the attribute', () => {
    expect(
      graphNodeTarget({ kind: 'value', id: 'value:obj-1:storage', typeKey: 'product', caption: 'Storage' }),
    ).toEqual({ objectId: 'obj-1', typeKey: 'product', sourceName: 'Storage' })
    expect(valueNodeObjectId({ kind: 'value', id: 'value:obj-1:storage' })).toBe('obj-1')
    expect(valueNodeObjectId({ kind: 'object', id: 'object:obj-1' })).toBe('')
  })

  it('carries the node key and caption so the dialog can name both ends', () => {
    expect(
      graphNodeKey({ properties: [{ label: 'Number', value: 'ART-CHOC-100' }] }),
    ).toBe('ART-CHOC-100')
    expect(
      graphNodeTarget({
        kind: 'object',
        id: 'object:obj-1',
        objectId: 'obj-1',
        typeKey: 'article',
        caption: 'Dark chocolate 70% 100 g',
        properties: [{ label: 'Number', value: 'ART-CHOC-100' }],
      }),
    ).toEqual({
      objectId: 'obj-1',
      typeKey: 'article',
      sourceKey: 'ART-CHOC-100',
      sourceName: 'Dark chocolate 70% 100 g',
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

  it('an object node link entry opens the add-link dialog for that link type and direction', () => {
    const added: Array<{ linkType?: string; direction?: string }> = []
    const onAdd = (event: Event) => added.push((event as CustomEvent<{ linkType?: string; direction?: string }>).detail)
    window.addEventListener('braian-add-link', onAdd)
    try {
      renderModelGraph()
      act(() => {
        openGraphNodeMenu(
          { kind: 'object', id: 'object:obj-1', objectId: 'obj-1', typeKey: 'product', caption: 'Product' },
          defs,
          10,
          10,
        )
      })
      const menu = screen.getByTestId('context-menu')
      expect(within(menu).getByRole('menuitem', { name: 'Link Articles…' })).toBeTruthy()
      fireEvent.click(within(menu).getAllByRole('menuitem')[0])
      expect(added).toEqual([{ linkType: 'product_articles', direction: 'out' }])
    } finally {
      window.removeEventListener('braian-add-link', onAdd)
    }
  })

  it('the graph menu hands the picker the relation, direction and real object id', () => {
    vi.spyOn(globalThis, 'fetch')
    const requests: Array<{ linkType?: string; direction?: string; objectId?: string; typeKey?: string }> = []
    renderModelGraph()
    act(() => {
      openGraphNodeMenu(
        { kind: 'object', id: 'object:obj-1', objectId: 'obj-1', typeKey: 'article', caption: 'Article' },
        defs,
        10,
        10,
        (request) => requests.push(request),
      )
    })
    const menu = screen.getByTestId('context-menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Link Product…',
      'Link Supplier…',
      'Link Replaced by…',
      'Link Replaces…',
    ])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Link Supplier…' }))
    expect(requests).toEqual([
      {
        linkType: 'supplier_articles',
        direction: 'in',
        objectId: 'obj-1',
        typeKey: 'article',
        sourceName: 'Article',
      },
    ])
  })

  it('the runner ignores an unknown command and passes the direction through', () => {
    const requests: Array<{ linkType?: string; direction?: string }> = []
    runGraphNodeCommand('graph:add-link:replaces:in', { objectId: 'obj-1', typeKey: 'article' }, (request) =>
      requests.push(request),
    )
    runGraphNodeCommand('graph:nothing', { objectId: 'obj-1' }, (request) => requests.push(request))
    expect(requests).toEqual([{ linkType: 'replaces', direction: 'in', objectId: 'obj-1', typeKey: 'article' }])
  })

  it('the runner expands a group or structure node through its own action', () => {
    let expanded = 0
    runGraphNodeCommand('graph:node:expand', {}, undefined, () => {
      expanded += 1
    })
    expect(expanded).toBe(1)
  })

  it('empty canvas right-click does not open a menu', () => {
    renderModelGraph()
    fireEvent.contextMenu(screen.getByTestId('graph-stage'), { clientX: 5, clientY: 5 })
    expect(screen.queryByTestId('context-menu')).toBeNull()
  })
})
