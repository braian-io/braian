import { describe, expect, it } from 'vitest'
import {
  assignPublicTokens,
  objectKeyFromValues,
  objectTokenFor,
  publicToken,
  resolveObjectToken,
  resolvePublicToken,
  shortId,
  slugify,
  splitObjectToken,
} from './url-public'
import { urlObjectTypeKey } from './use-readable-url'

const low = '018f0000-0000-7000-8000-0000000000aa'
const high = '018f0000-0000-7000-8000-0000000000bb'
const empty = '018f0000-0000-7000-8000-0000000000dd'
const key = 'ART/Æ& +'

describe('slugify', () => {
  it('keeps Unicode letters and digits, lowercased and normalized', () => {
    expect(slugify('Products')).toBe('products')
    expect(slugify('Data model')).toBe('data_model')
    expect(slugify('SAP ERP')).toBe('sap_erp')
    expect(slugify('A  B')).toBe('a__b')
    expect(slugify('Café au lait')).toBe('café_au_lait')
    expect(slugify('Cafe\u0301')).toBe('café')
    expect(slugify('Ελληνικά')).toBe('ελληνικά')
    expect(slugify('商品 目录')).toBe('商品_目录')
    expect(slugify('---')).toBe('')
    expect(slugify('\u0301\u0302')).toBe('')
    expect(slugify('e\u0301')).toBe('é')
  })
})

describe('navigation tokens', () => {
  const rows = [
    { id: low, label: 'Products' },
    { id: high, label: 'Products' },
    { id: '018f0000-0000-7000-8000-0000000000cc', label: 'Data model' },
    { id: empty, label: '!!!' },
  ]

  it('uses the name slug, and a short id only for the higher id', () => {
    const tokens = assignPublicTokens(rows)
    expect(tokens.get(low)).toBe('products')
    expect(tokens.get(high)).toBe(`products~${high.replace(/-/g, '').slice(-8)}`)
    expect(tokens.get('018f0000-0000-7000-8000-0000000000cc')).toBe('data_model')
    expect(tokens.get(empty)).toBe(`~${shortId(empty)}`)
    expect(publicToken(rows, low)).toBe('products')
  })

  it('roundtrips the current token and rejects a uuid or a stale suffix', () => {
    expect(resolvePublicToken(rows, 'products')).toBe(low)
    expect(resolvePublicToken(rows, `products~${high.replace(/-/g, '').slice(-8)}`)).toBe(high)
    expect(resolvePublicToken(rows, `products~${low.replace(/-/g, '').slice(-8)}`)).toBeNull()
    expect(resolvePublicToken(rows, low)).toBeNull()
    expect(resolvePublicToken(rows, 'missing')).toBeNull()
    expect(resolvePublicToken(rows, '!!!')).toBeNull()
    expect(resolvePublicToken(rows, `~${shortId(empty)}`)).toBe(empty)
  })

  it('does not keep the old slug after a rename', () => {
    const renamed = rows.map((row) => row.id === low ? { ...row, label: 'Summer range' } : row)
    expect(publicToken(renamed, low)).toBe('summer_range')
    expect(resolvePublicToken(renamed, 'products')).toBe(high)
    expect(resolvePublicToken(renamed, 'summer_range')).toBe(low)
  })

  it('keeps non-ASCII names addressable', () => {
    const unicode = [
      { id: low, label: 'Ελληνικά' },
      { id: high, label: '商品' },
    ]
    expect(publicToken(unicode, low)).toBe('ελληνικά')
    expect(publicToken(unicode, high)).toBe('商品')
    expect(resolvePublicToken(unicode, 'ελληνικά')).toBe(low)
    expect(resolvePublicToken(unicode, '商品')).toBe(high)
  })
})

describe('object tokens', () => {
  const peers = [
    { id: low, key },
    { id: high, key },
    { id: '018f0000-0000-7000-8000-0000000000cc', key: 'PLAIN' },
  ]

  it('keeps the key verbatim and suffixes only the collision loser', () => {
    expect(objectTokenFor(peers[2], peers)).toBe('PLAIN')
    expect(objectTokenFor(peers[0], peers)).toBe(key)
    const suffix = high.replace(/-/g, '').slice(-8)
    expect(objectTokenFor(peers[1], peers)).toBe(`${key}~${suffix}`)
    expect(splitObjectToken(key)).toEqual({ key })
    expect(splitObjectToken(`${key}~${suffix}`)).toEqual({ key, short: suffix })
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
    expect(resolveObjectToken(renamed, key)).toBe(high)
    expect(resolveObjectToken(renamed, 'NEXT')).toBe(low)
  })

  it('escapes a literal tilde even when the type scope needs no peer suffix', () => {
    const single = { id: low, key: 'A~deadbeef' }
    expect(objectTokenFor(single, [single])).toBe('A~~deadbeef')
    expect(splitObjectToken('A~~deadbeef')).toEqual({ key: 'A~deadbeef' })
    expect(resolveObjectToken([single], 'A~~deadbeef')).toBe(low)
    expect(resolveObjectToken([single], 'A~deadbeef')).toBeNull()

    const double = { id: high, key: 'A~~B' }
    expect(objectTokenFor(double, [double])).toBe('A~~~~B')
    expect(splitObjectToken('A~~~~B')).toEqual({ key: 'A~~B' })
    expect(resolveObjectToken([double], 'A~~~~B')).toBe(high)
    expect(resolveObjectToken([double], 'A~~B')).toBeNull()
  })

  it('escapes a literal tilde so it cannot be read as a collision suffix', () => {
    const winner = '018f0000-0000-7000-8000-000000000001'
    const suffix = high.replace(/-/g, '').slice(-8)
    const tildeKey = `SKU~${suffix}`
    const rows = [
      { id: winner, key: 'SKU' },
      { id: high, key: 'SKU' },
      { id: low, key: tildeKey },
    ]
    expect(objectTokenFor(rows[1], rows)).toBe(`SKU~${suffix}`)
    expect(objectTokenFor(rows[2], rows)).toBe(`SKU~~${suffix}`)
    expect(splitObjectToken(`SKU~~${suffix}`)).toEqual({ key: tildeKey })
    expect(resolveObjectToken(rows, `SKU~${suffix}`)).toBe(high)
    expect(resolveObjectToken(rows, `SKU~~${suffix}`)).toBe(low)
    expect(resolveObjectToken(rows, tildeKey)).toBe(high)
    expect(resolveObjectToken(rows, 'SKU')).toBe(winner)
  })

  it('gives a keyless row a random short id suffix token', () => {
    const link = '018f0000-0000-7000-8000-00000000abcd'
    const rows = [{ id: link, key: null }]
    const token = objectTokenFor(rows[0], rows)!
    expect(token).toBe(`~${shortId(link)}`)
    expect(splitObjectToken(token)).toEqual({ key: '', short: shortId(link) })
    expect(resolveObjectToken(rows, token)).toBe(link)
    expect(resolveObjectToken(rows, `~${shortId('ffffffff-0000-7000-8000-000000000000')}`)).toBeNull()
  })

  it('keeps keyless rows created in the same UUIDv7 window distinct', () => {
    const first = '018f0000-0000-7000-8000-00000000aaaa'
    const second = '018f0000-0000-7000-8000-00000000bbbb'
    const rows = [{ id: first, key: null }, { id: second, key: null }]
    const one = objectTokenFor(rows[0], rows)!
    const two = objectTokenFor(rows[1], rows)!
    expect(one).not.toBe(two)
    expect(resolveObjectToken(rows, one)).toBe(first)
    expect(resolveObjectToken(rows, two)).toBe(second)
  })

  it('does not accept a longer or stale keyless suffix', () => {
    const link = '018f0000-0000-7000-8000-00000000abcd'
    const rows = [{ id: link, key: null }]
    const long = `~${shortId(link, 12)}`
    expect(resolveObjectToken(rows, long)).toBeNull()
    expect(resolveObjectToken(rows, `~${shortId(link).replace(/.$/, '0')}`)).toBeNull()
  })

  it('extends the keyless suffix when peers share the short tail and roundtrips emitted tokens', () => {
    const first = '018f0000-0000-7000-8000-0000aaaa12345678'
    const second = '018f0000-0000-7000-8000-0000bbbb12345678'
    const rows = [{ id: first, key: null }, { id: second, key: null }]
    const one = objectTokenFor(rows[0], rows)!
    const two = objectTokenFor(rows[1], rows)!
    expect(one).not.toBe(two)
    expect(one.slice(1)).toHaveLength(12)
    expect(two.slice(1)).toHaveLength(12)
    expect(resolveObjectToken(rows, one)).toBe(first)
    expect(resolveObjectToken(rows, two)).toBe(second)
    // The shared 8-char tail is not an emitted token and stays unusable.
    expect(resolveObjectToken(rows, `~${shortId(first)}`)).toBeNull()
  })

  it('leaves a unique keyless tail at the short length', () => {
    const link = '018f0000-0000-7000-8000-00000000abcd'
    const rows = [{ id: link, key: null }]
    expect(objectTokenFor(rows[0], rows)).toBe(`~${shortId(link)}`)
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
    { id: 'id-only', type: 'object_table', state: { object_type: '018f0000-0000-7000-8000-000000000200' } },
  ]

  it('prefers the focused table, else the detail list', () => {
    expect(urlObjectTypeKey('table', 'other', views)).toBe('product')
    expect(urlObjectTypeKey('detail', 'other', views)).toBe('article')
    expect(urlObjectTypeKey('detail', 'detail', views)).toBeNull()
    expect(urlObjectTypeKey('id-only', null, views)).toBe('018f0000-0000-7000-8000-000000000200')
  })
})
