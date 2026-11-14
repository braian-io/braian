import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { describe, expect, it } from 'vitest'
import type { Json } from './api'
import {
  buildScene,
  capScene,
  mergeScene,
  nodeMark,
  nodeRadius,
  placedSceneNodes,
  relationLabel,
  sentenceCaseLabel,
  structureCaption,
  visibleCaptionIds,
  visibleLabelIds,
} from './graph-scene'

const defs: Json = {
  types: [{ key: 'article', labels: { en: 'Article' } }, { key: 'product', labels: { en: 'Product' } }],
  value_lists: [
    {
      key: 'status',
      options: [{ code: 'ok', labels: { en: 'OK' } }],
    },
    {
      key: 'colour',
      options: [{ code: 'green', labels: { en: 'Green' } }],
    },
  ],
  attributes: [
    { key: 'number', labels: { en: 'Number' }, kind: { type: 'text' } },
    { key: 'name', labels: { en: 'Name' }, kind: { type: 'text' } },
    { key: 'description', labels: { en: 'Description' }, kind: { type: 'text' } },
    { key: 'colour', labels: { en: 'Colour' }, kind: { type: 'value_list', list: 'colour' } },
    { key: 'weight', labels: { en: 'Weight' }, kind: { type: 'number' } },
  ],
  structures: [
    {
      key: 'assortment',
      labels: { en: 'eCom' },
      groups: [
        { id: 'outdoor', key: 'outdoor', labels: { en: 'Outdoor' } },
        { id: 'tents', key: 'tents', parent: 'outdoor', labels: { en: 'Tents' } },
      ],
    },
  ],
}

const graph: Json = {
  id: 'tent',
  key: 'ART-TENT-2',
  type: 'article',
  groups: { assortment: 'tents' },
  links: [{ link_type: 'product_articles', label: 'Article of', object_id: 'prod', key: 'PROD-TENT', type_id: 'ignored', direction: 'incoming' }],
  attributes: [
    { key: 'name', label: 'Name', sources: [{ from: 'type' }] },
    { key: 'number', label: 'Number', sources: [{ from: 'type' }] },
    { key: 'description', label: 'Description', sources: [{ from: 'type' }] },
    { key: 'colour', label: 'Colour', sources: [{ from: 'type' }] },
    {
      key: 'weight',
      label: 'Weight',
      sources: [{ from: 'group', structure: 'assortment', class: 'outdoor', group: 'outdoor', inherited: true }],
    },
  ],
}

const values: Json = {
  name: { sv: 'Two-person tent', en: '2-person tent' },
  number: 'ART-TENT-2',
  description: { en: 'Light 2-layer hiking tent.' },
  colour: ['green'],
  weight: { value: '2.4', unit: 'kg' },
}

describe('graph marks', () => {
  it('puts a short mark inside and keeps the full name for the caption', () => {
    expect(nodeMark('2-person tent')).toBe('2T')
    expect(nodeMark('Ridge tents')).toBe('RT')
    expect(nodeMark('Colour')).toBe('C')
    expect(nodeMark('OK')).toBe('OK')
    expect(nodeMark('Description').includes('…')).toBe(false)
    expect(nodeRadius('object', 8)).toBeGreaterThan(nodeRadius('value', 1))
    expect(nodeRadius('object', 1)).toBeLessThan(nodeRadius('object', 6))
  })

  it('hides the lower-priority label when two captions occupy the same box', () => {
    const shown = visibleLabelIds(
      [
        { id: 'value', priority: 0, left: 0, top: 0, right: 40, bottom: 16 },
        { id: 'object', priority: 3, left: 10, top: 0, right: 50, bottom: 16 },
        { id: 'free', priority: 0, left: 80, top: 0, right: 120, bottom: 16 },
      ],
      1,
    )
    expect([...shown].sort()).toEqual(['free', 'object'])
    const zoomedOut = visibleLabelIds(
      [
        { id: 'value', priority: 0, left: 0, top: 0, right: 20, bottom: 12 },
        { id: 'object', priority: 3, left: 40, top: 0, right: 60, bottom: 12 },
      ],
      0.4,
    )
    expect([...zoomedOut]).toEqual(['object'])
  })

  it('makes an active value chip yield to an overlapping shown name', () => {
    const name = { id: 'object:014', priority: 3, kind: 'object' as const, left: 0, top: 0, right: 80, bottom: 16 }
    const chip = { id: 'value:014:carbohydrates', priority: 5, kind: 'value' as const, left: 30, top: 2, right: 120, bottom: 18 }
    const shown = visibleCaptionIds([name, chip], 1, { paneWidth: 230 })
    expect(shown.has('object:014'), 'the shown name keeps its caption').toBe(true)
    expect(shown.has('value:014:carbohydrates'), 'the active chip still yields').toBe(false)
    expect(
      [...visibleLabelIds([name, chip], 1)],
      'the collision pass ranks value chips below real names',
    ).toEqual(['object:014'])
  })

  it('keeps a caption wider than the pane out without dropping a clamped name', () => {
    const name = { id: 'article', priority: 5, left: 10, top: 10, right: 239, bottom: 26 }
    const chip = { id: 'value', priority: 0, left: 20, top: 10, right: 260, bottom: 26 }
    const shown = visibleCaptionIds([name, chip], 1, { paneWidth: 240 })
    expect(shown.has('article'), 'a 229 px name fits a 240 px pane').toBe(true)
    expect(shown.has('value'), 'a 240 px chip is clipped by the pane').toBe(false)
  })

  it('keeps a 229 px name in a 230 px pane when no edge label covers it', () => {
    const name = { id: 'article', priority: 5, left: 0.5, top: 10, right: 229.5, bottom: 26 }
    const shown = visibleCaptionIds([name], 1, { paneWidth: 230 })
    expect(shown.has('article'), 'the hair-width pane does not drop the clamped name').toBe(true)
  })

  it('hides a caption under a painted edge label so the label keeps the space', () => {
    const article = { id: 'article', priority: 5, left: 10, top: 10, right: 60, bottom: 26 }
    const value = { id: 'value', priority: 0, left: 70, top: 10, right: 110, bottom: 26 }
    const shown = visibleCaptionIds([article, value], 1, {
      paneWidth: 400,
      edgeLabels: [{ left: 20, top: 12, right: 50, bottom: 24 }],
    })
    expect(shown.has('article')).toBe(false)
    expect(shown.has('value')).toBe(true)
  })
})

describe('graph scene', () => {
  it('names nodes and provenance edges in English', () => {
    const scene = buildScene({ graph, values, defs })
    const captions = scene.nodes.map((node) => node.caption)
    expect(captions).toContain('2-person tent')
    expect(captions).toContain('Colour')
    expect(captions).toContain('Number')
    expect(captions).toContain('Description')
    expect(captions).toContain('Outdoor')
    expect(captions).toContain('Tents')
    expect(captions).toContain('eCom')
    expect(scene.nodes.some((node) => node.id === 'structure:assortment' && node.kind === 'structure')).toBe(true)
    expect(scene.edges.some((edge) => edge.label === 'In structure' && edge.target === 'structure:assortment')).toBe(true)
    expect(captions.some((caption) => ['colour', 'name', 'outdoor', 'number'].includes(caption))).toBe(false)

    const colour = scene.nodes.find((node) => node.caption === 'Colour')
    expect(colour?.subtitle).toBe('Green')
    expect(scene.edges.some((edge) => edge.source === colour?.id && edge.label === 'From type' && edge.target === 'object:tent')).toBe(true)

    const weight = scene.nodes.find((node) => node.caption === 'Weight')
    expect(weight?.subtitle).toContain('2.4')
    expect(scene.edges.some((edge) => edge.source === weight?.id && edge.label === 'Inherited' && edge.target === 'class:assortment:outdoor')).toBe(true)
    expect(scene.edges.some((edge) => edge.label === 'Applies in' && edge.source === 'class:assortment:outdoor' && edge.target === 'group:assortment:outdoor')).toBe(true)
    expect(weight?.properties.some((property) => property.label === 'Origin' && property.value === 'Inherited: Outdoor')).toBe(true)
    expect(scene.edges.some((edge) => edge.label === 'Article of' && edge.target === 'object:prod')).toBe(true)
    const unresolved = scene.nodes.find((node) => node.id === 'object:prod')
    expect(unresolved?.caption).toBe('Object')
    expect(unresolved?.rawCaption).toBe(true)
    expect(unresolved?.properties.some((property) => property.value === 'PROD-TENT')).toBe(true)
    expect(unresolved?.caption.includes('PROD-TENT')).toBe(false)
    const named = buildScene({
      graph,
      values,
      defs,
      known: { prod: { name: 'Ridge tents', typeKey: 'product' } },
    })
    const resolved = named.nodes.find((node) => node.id === 'object:prod')
    expect(resolved?.caption).toBe('Ridge tents')
    expect(resolved?.rawCaption).toBe(false)
    expect(resolved?.properties.some((property) => property.value === 'PROD-TENT')).toBe(true)
    expect(relationLabel('variant_of')).toBe('Variant of')
    expect(sentenceCaseLabel('supplier of product n-n')).toBe('Supplier of product n-n')
    expect(sentenceCaseLabel('Supplier of product n-n')).toBe('Supplier of product n-n')
    expect(structureCaption('bag')).toBe('bag')
    expect(structureCaption('tents', defs)).toBe('Tents')
  })

  it('sentence-cases a relation label that arrives lowercase from the API', () => {
    const scene = buildScene({
      graph: {
        id: 'tent',
        key: 'ART-TENT-2',
        type: 'article',
        links: [
          {
            link_type: 'supplier_of_product',
            label: 'supplier of product n-n',
            object_id: 'prod',
            key: 'PROD-TENT',
            type_id: 'type-product',
            direction: 'outgoing',
          },
        ],
        attributes: [],
      },
      defs: {
        ...defs,
        types: [
          ...((defs.types as Json[]) ?? []),
          { id: 'type-product', key: 'product', kind: 'entity', labels: { en: 'Product' } },
        ],
      },
    })
    expect(scene.edges.some((edge) => edge.label === 'Supplier of product n-n')).toBe(true)
    expect(scene.edges.some((edge) => edge.label === 'supplier of product n-n')).toBe(false)
  })

  it('draws an ancestor group attribute as inherited when it has no class', () => {
    const scene = buildScene({
      graph: {
        id: 'tent',
        key: 'ART-TENT-2',
        type: 'article',
        groups: { assortment: 'tents' },
        links: [],
        attributes: [
          {
            key: 'weight',
            label: 'Weight',
            sources: [{ from: 'group', structure: 'assortment', group: 'outdoor', inherited: true }],
          },
        ],
      },
      values: { weight: { value: '2.4', unit: 'kg' } },
      defs,
    })
    const weight = scene.nodes.find((node) => node.caption === 'Weight')
    expect(scene.edges.some((edge) => edge.source === weight?.id && edge.label === 'Inherited' && edge.target === 'group:assortment:outdoor')).toBe(true)
    expect(scene.edges.some((edge) => edge.source === weight?.id && edge.label === 'From type')).toBe(false)
    expect(weight?.properties.some((property) => property.value === 'Inherited: Outdoor')).toBe(true)
  })

  it('upgrades a key to a human name without duplicating the node', () => {
    const first = buildScene({ graph, values, defs })
    const second = buildScene({
      graph: { id: 'prod', key: 'PROD-TENT', type: 'product', groups: {}, links: [], attributes: [] },
      values: { name: { en: 'Ridge tents' }, number: 'PROD-TENT' },
      defs,
    })
    const merged = mergeScene(first, second)
    const matches = merged.nodes.filter((node) => node.id === 'object:prod')
    expect(matches).toHaveLength(1)
    expect(matches[0]?.caption).toBe('Ridge tents')
    expect(matches[0]?.subtitle).toBe('Product')
    const again = mergeScene(merged, second)
    expect(again.nodes.filter((node) => node.id === 'object:prod')).toHaveLength(1)
    expect(again.edges.filter((edge) => edge.label === 'Article of')).toHaveLength(1)
  })

  it('drops nodes past the cap and the edges that pointed at them', () => {
    const nodes = Array.from({ length: 5 }, (_, index) => ({
      id: `n${index}`,
      kind: 'object' as const,
      caption: `Node ${index}`,
      subtitle: 'Object',
      rawCaption: false,
      properties: [],
    }))
    const capped = capScene(
      {
        nodes,
        edges: [
          { id: 'keep', source: 'n0', target: 'n1', label: 'Has' },
          { id: 'drop', source: 'n0', target: 'n4', label: 'Has' },
        ],
      },
      4,
    )
    expect(capped.capped).toBe(true)
    expect(capped.scene.nodes.map((node) => node.id)).toEqual(['n0', 'n1', 'n2', 'n3'])
    expect(capped.scene.edges.map((edge) => edge.id)).toEqual(['keep'])
  })

  it('keeps the focus and its direct link peers in the layout while names resolve', () => {
    const scene = buildScene({
      defs,
      graph: {
        id: 'article-1',
        links: [{ object_id: 'product-1', label: 'Product', link_type: 'product_articles' }],
      },
      values: {},
      known: {},
    })
    const focusKey = 'object:article-1'
    const placed = placedSceneNodes(scene, focusKey)
    const ids = placed.nodes.map((node) => node.id)
    expect(ids).toContain(focusKey)
    expect(ids).toContain('object:product-1')
    expect(ids.filter((id) => id.startsWith('group:') || id.startsWith('value:'))).toEqual(ids.filter((id) => !id.startsWith('object:')))
  })

  it('ticks a few hundred nodes inside a second', () => {
    const count = 240
    const nodes = Array.from({ length: count }, (_, index) => ({
      id: String(index),
      x: Math.cos(index) * 120,
      y: Math.sin(index) * 120,
    }))
    const links = Array.from({ length: count }, (_, index) => ({
      source: String(index),
      target: String((index + 7) % count),
    }))
    const started = performance.now()
    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((node) => String((node as { id?: string }).id ?? '')).distance(80))
      .force('charge', forceManyBody().strength(-30).distanceMax(240))
      .force('center', forceCenter())
      .force('collide', forceCollide(12))
      .stop()
    for (let step = 0; step < 40; step += 1) sim.tick()
    expect(performance.now() - started).toBeLessThan(1000)
    expect(Number.isFinite(nodes[0]?.x)).toBe(true)
  })
})
