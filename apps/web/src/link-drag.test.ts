import { describe, expect, it } from 'vitest'
import { linkDragLabel, linkDragObjects, linkDropDecision, linkDropFromSection } from './link-drag'
import type { LinkEndpoint } from './link-create-dialog'

const oat: LinkEndpoint = { id: 'oat', typeKey: 'article', name: 'Oat', key: 'ART-OAT-1L' }
const coffee: LinkEndpoint = { id: 'coffee', typeKey: 'article', name: 'Coffee', key: 'ART-COFFEE-250' }
const choc: LinkEndpoint = { id: 'choc', typeKey: 'article', name: 'Chocolate', key: 'ART-CHOC-100' }

describe('link drag payload', () => {
  it('drags only the row under the pointer when it is not selected', () => {
    expect(linkDragObjects(coffee, ['oat'], [oat, coffee, choc])).toEqual([coffee])
  })

  it('drags every selected row when the pointer starts on one of them', () => {
    expect(linkDragObjects(coffee, ['coffee', 'choc'], [oat, coffee, choc])).toEqual([coffee, choc])
  })

  it('drops the dragged rows onto the open object with that section’s direction', () => {
    expect(linkDropFromSection({
      object: { id: 'ched', typeKey: 'article', name: 'Cheddar', key: 'ART-CHED-200' },
      dragged: [oat, { id: 'ched', typeKey: 'article', key: 'ART-CHED-200' }],
      linkType: 'replaces',
      direction: 'out',
    })).toEqual({
      source: { id: 'ched', typeKey: 'article', name: 'Cheddar', key: 'ART-CHED-200' },
      targets: [oat],
      preferred: { linkType: 'replaces', direction: 'out' },
    })
  })

  it('names one dragged object and counts several of the same type', () => {
    expect(linkDragLabel([oat])).toBe('Link Oat')
    expect(linkDragLabel([oat, coffee], {
      types: [{ key: 'article', kind: 'entity', plural: { en: 'Articles' }, singular: { en: 'Article' } }],
    })).toBe('Link 2 articles')
    expect(linkDragLabel([oat, { ...coffee, typeKey: 'product' }])).toBe('Link 2 objects')
  })
})

describe('linkDropDecision', () => {
  const defs = {
    types: [
      { id: 'type-article', key: 'article', kind: 'entity' },
      { id: 'type-supplier', key: 'supplier', kind: 'entity' },
      {
        id: 'link-supplies',
        key: 'supplier_articles',
        kind: 'link',
        link: { from_types: ['type-supplier'], to_types: ['type-article'] },
      },
    ],
  }

  it('refuses every row while link types are still loading', () => {
    expect(linkDropDecision({
      loading: true,
      anchorType: 'article',
      draggedTypes: ['supplier'],
    })).toEqual({ accept: false, reason: 'loading', hint: 'Loading link types…' })
  })

  it('uses cached definitions during a refresh', () => {
    expect(linkDropDecision({
      loading: true,
      defs,
      anchorType: 'article',
      draggedTypes: ['supplier'],
    }).accept).toBe(true)
  })

  it('names a pair that cannot link', () => {
    const decision = linkDropDecision({
      loading: false,
      defs,
      anchorType: 'supplier',
      draggedTypes: ['supplier'],
    })
    expect(decision.accept).toBe(false)
    if (!decision.accept) expect(decision.hint).toBe("suppliers can't link to suppliers")
  })
})
