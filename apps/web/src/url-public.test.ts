import { describe, expect, it } from 'vitest'
import {
  assignPublicTokens,
  objectKeyFromValues,
  objectTokenFor,
  publicToken,
  resolveObjectToken,
  resolvePublicToken,
  slugify,
  splitObjectToken,
} from './url-public'
import { urlObjectTypeKey } from './use-readable-url'

const low = '018f0000-0000-7000-8000-0000000000aa'
const high = '018f0000-0000-7000-8000-0000000000bb'

describe('slugify', () => {
  it('follows the repo slug: lower ASCII, everything else becomes underscore', () => {
    expect(slugify('Products')).toBe('products')
    expect(slugify('Data model')).toBe('data_model')
    expect(slugify('SAP ERP')).toBe('sap_erp')
    expect(slugify('A  B')).toBe('a__b')
    expect(slugify('Öl & Möbler')).toBe('l___m_bler')
    expect(slugify('---')).toBe('')
    expect(slugify('Å')).toBe('')
  })
})

describe('navigation tokens', () => {
  const rows = [
    { id: low, label: 'Products' },
    { id: high, label: 'Products' },
    { id: '018f0000-0000-7000-8000-0000000000cc', label: 'Data model' },
    { id: '018f0000-0000-7000-8000-0000000000dd', label: '!!!' },
  ]

  it('uses the name slug, and a short id only for the higher id', () => {
    const tokens = assignPublicTokens(rows)
    expect(tokens.get(low)).toBe('products')
    expect(tokens.get(high)).toBe(`products~${high.replace(/-/g, '').slice(-8)}`)
    expect(tokens.get('018f0000-0000-7000-8000-0000000000cc')).toBe('data_model')
    expect(tokens.has('018f0000-0000-7000-8000-0000000000dd')).toBe(false)
    expect(publicToken(rows, low)).toBe('products')
  })

  it('roundtrips the current token and rejects a uuid or a stale suffix', () => {
    expect(resolvePublicToken(rows, 'products')).toBe(low)
    expect(resolvePublicToken(rows, `products~${high.replace(/-/g, '').slice(-8)}`)).toBe(high)
    expect(resolvePublicToken(rows, `products~${low.replace(/-/g, '').slice(-8)}`)).toBeNull()
    expect(resolvePublicToken(rows, low)).toBeNull()
    expect(resolvePublicToken(rows, 'missing')).toBeNull()
    expect(resolvePublicToken(rows, '!!!')).toBeNull()
  })

  it('does not keep the old slug after a rename', () => {
    const renamed = rows.map((row) => row.id === low ? { ...row, label: 'Summer range' } : row)
    expect(publicToken(renamed, low)).toBe('summer_range')
    expect(resolvePublicToken(renamed, 'products')).toBe(high)
    expect(resolvePublicToken(renamed, 'summer_range')).toBe(low)
  })
})

describe('object tokens', () => {
  const peers = [
    { id: low, key: 'ART/Å& +' },
    { id: high, key: 'ART/Å& +' },
    { id: '018f0000-0000-7000-8000-0000000000cc', key: 'PLAIN' },
  ]

  it('keeps the key verbatim and suffixes only the collision loser', () => {
    expect(objectTokenFor(peers[2], peers)).toBe('PLAIN')
    expect(objectTokenFor(peers[0], peers)).toBe('ART/Å& +')
    const suffix = high.replace(/-/g, '').slice(-8)
    expect(objectTokenFor(peers[1], peers)).toBe(`ART/Å& +~${suffix}`)
    expect(splitObjectToken('ART/Å& +')).toEqual({ key: 'ART/Å& +' })
    expect(splitObjectToken(`ART/Å& +~${suffix}`)).toEqual({ key: 'ART/Å& +', short: suffix })
  })

  it('roundtrips in scope and refuses the wrong row, a uuid, and a stale key', () => {
    const winner = objectTokenFor(peers[0], peers)!
    const loser = objectTokenFor(peers[1], peers)!
    expect(resolveObjectToken(peers, winner)).toBe(low)
    expect(resolveObjectToken(peers, loser)).toBe(high)
    expect(resolveObjectToken(peers, low)).toBeNull()
    expect(resolveObjectToken(peers, 'PLAIN')).toBe(peers[2].id)
    const renamed = peers.map((row) => row.id === low ? { ...row, key: 'NEXT' } : row)
    expect(objectTokenFor(renamed[0], renamed)).toBe('NEXT')
    expect(resolveObjectToken(renamed, 'ART/Å& +')).toBe(high)
    expect(resolveObjectToken(renamed, 'NEXT')).toBe(low)
  })

  it('fails closed when the whole key and a suffix split name different rows', () => {
    const winner = '018f0000-0000-7000-8000-000000000001'
    const suffix = high.replace(/-/g, '').slice(-8)
    const awkward = [
      { id: winner, key: 'SKU' },
      { id: high, key: 'SKU' },
      { id: low, key: `SKU~${suffix}` },
    ]
    expect(objectTokenFor(awkward[1], awkward)).toBe(`SKU~${suffix}`)
    expect(objectTokenFor(awkward[2], awkward)).toBe(`SKU~${suffix}`)
    expect(resolveObjectToken(awkward, `SKU~${suffix}`)).toBeNull()
    expect(resolveObjectToken(awkward, 'SKU')).toBe(winner)
  })

  it('reads the key attribute and ignores a missing key', () => {
    const defs = {
      types: [{ key: 'product', key_attribute: 'attr-number' }],
      attributes: [{ id: 'attr-number', key: 'number' }],
    }
    expect(objectKeyFromValues('product', { number: 'ART-1', name: { en: 'Loaf' } }, defs)).toBe('ART-1')
    expect(objectKeyFromValues('product', { name: { en: 'Loaf' } }, defs)).toBeNull()
    expect(objectKeyFromValues('link', { number: 'ART-1' }, defs)).toBeNull()
  })
})

describe('url object type context', () => {
  const views = [
    { id: 'table', type: 'object_table', state: { type_key: 'product' } },
    { id: 'detail', type: 'object_detail', state: {} },
    { id: 'other', type: 'object_table', state: { type_key: 'article' } },
  ]

  it('prefers the focused table, else the detail list', () => {
    expect(urlObjectTypeKey('table', 'other', views)).toBe('product')
    expect(urlObjectTypeKey('detail', 'other', views)).toBe('article')
    expect(urlObjectTypeKey('detail', 'detail', views)).toBeNull()
  })
})
