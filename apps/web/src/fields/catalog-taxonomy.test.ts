import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fieldCatalogForType, type DefsJson } from './catalog'

function attribute(id: string, key: string, label: string, kind: Record<string, unknown> = { type: 'text' }) {
  return { id, key, labels: { en: label }, kind }
}

const defs = {
  languages: ['en'],
  unit_families: [],
  attributes: [
    attribute('a-own', 'own_key', 'Own attribute'),
    attribute('a-group-parent', 'group_parent', 'Parent attribute'),
    attribute('a-group-child', 'group_child', 'Child attribute'),
    attribute('a-group-class', 'group_class', 'Nested class attribute'),
    attribute('a-class-parent', 'class_parent', 'Legacy class attribute'),
    attribute('a-class-child', 'class_child', 'Legacy child class attribute'),
    attribute('a-other', 'other_structure', 'Other structure attribute'),
  ],
  types: [
    {
      id: 't-one',
      key: 'one',
      labels: { en: 'One' },
      structures: ['s1'],
      attributes: ['a-own'],
    },
    {
      id: 't-all',
      key: 'all',
      labels: { en: 'All' },
      attributes: [],
    },
    {
      id: 't-none',
      key: 'none',
      labels: { en: 'None' },
      structures: [],
      attributes: [],
    },
  ],
  structures: [
    {
      id: 's1',
      key: 'food',
      labels: { en: 'Food' },
      groups: [
        {
          id: 'g-parent',
          key: 'parent',
          labels: { en: 'Parent group' },
          attributes: ['a-group-parent'],
          classes: [{ id: 'gc-nested', key: 'nested', attributes: ['a-group-class'] }],
        },
        {
          id: 'g-child',
          key: 'child',
          labels: { en: 'Child group' },
          parent: 'g-parent',
          attributes: ['a-group-child'],
        },
      ],
      classes: [
        { id: 'c-parent', key: 'legacy', group: 'g-parent', attributes: ['a-class-parent'] },
        { id: 'c-child', key: 'legacy_child', group: 'g-child', attributes: ['a-class-child'] },
      ],
    },
    {
      id: 's2',
      key: 'other-tree',
      labels: { en: 'Other tree' },
      groups: [
        {
          id: 'g-other',
          key: 'other',
          labels: { en: 'Other group' },
          attributes: ['a-other'],
        },
      ],
      classes: [],
    },
  ],
} satisfies DefsJson

function byId(typeKey: string) {
  return new Map(fieldCatalogForType(defs, typeKey).map((field) => [field.id, field]))
}

describe('attributesForType taxonomy walk', () => {
  it('includes every group, nested groups, and both legacy class-list shapes', () => {
    const fields = byId('one')
    expect([...fields.keys()]).toEqual([
      'own_key',
      'group_parent',
      'group_class',
      'group_child',
      'class_parent',
      'class_child',
    ])
  })

  it('labels group and class fields with the group display name, never the type list', () => {
    const fields = byId('one')
    expect(fields.get('own_key')?.source).toBeUndefined()
    expect(fields.get('group_parent')?.source).toBe('Parent group')
    expect(fields.get('group_child')?.source).toBe('Child group')
    expect(fields.get('group_class')?.source).toBe('Parent group')
    expect(fields.get('class_parent')?.source).toBe('Parent group')
    expect(fields.get('class_child')?.source).toBe('Child group')
  })

  it('skips structures the type does not allow', () => {
    const fields = byId('one')
    expect(fields.has('other_structure')).toBe(false)
  })

  it('treats a missing structures list as all structures and an empty list as none', () => {
    expect(byId('all').has('other_structure')).toBe(true)
    expect(byId('all').has('group_child')).toBe(true)
    expect([...byId('none').keys()]).toEqual([])
  })

  it('offers every own-type attribute under its attribute key and keeps path parts as qualifiers', () => {
    const fields = byId('one')
    expect(fields.get('own_key')?.id).toBe('own_key')
    expect(fields.get('own_key')?.source).toBeUndefined()
    expect([...fields.keys()].filter((id) => /\.(unit|label|value|min|max|code)$/.test(id))).toEqual([])
  })
})

describe('demo food tree', () => {
  const demo = JSON.parse(
    readFileSync(new URL('../../../../crates/server/demo/definitions.json', import.meta.url), 'utf8'),
  ) as DefsJson

  it('lists Product own attributes under the same keys the API path list uses', () => {
    const fields = new Map(fieldCatalogForType(demo, 'product').map((field) => [field.id, field]))
    const product = ((demo.types as Array<Record<string, unknown>>) ?? []).find((type) => type.key === 'product')
    expect(product).toBeTruthy()
    for (const id of (product?.attributes as string[]) ?? []) {
      const attr = ((demo.attributes as Array<Record<string, unknown>>) ?? []).find((item) => item.id === id)
      expect(attr).toBeTruthy()
      expect(fields.has(String(attr?.key))).toBe(true)
    }
  })

  it('offers nested group attributes and their group names on Product', () => {
    const fields = new Map(fieldCatalogForType(demo, 'product').map((field) => [field.id, field]))
    expect(fields.get('fat_content')?.source).toBe('Dairy & eggs')
    expect(fields.get('caffeine')?.source).toBe('Coffee & tea')
    expect(fields.get('cocoa_content')?.source).toBe('Chocolate')
  })

  it('does not leak food structure groups into a type that allows no structure', () => {
    const fields = new Map(fieldCatalogForType(demo, 'supplier').map((field) => [field.id, field]))
    expect(fields.has('fat_content')).toBe(false)
    expect(fields.has('caffeine')).toBe(false)
    expect(fields.has('cocoa_content')).toBe(false)
  })
})
