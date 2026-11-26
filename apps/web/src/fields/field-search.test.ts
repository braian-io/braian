import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fieldCatalogForType, type DefsJson } from './catalog'
import { fieldMatchesQuery } from './field-search'

const demo = JSON.parse(
  readFileSync(new URL('../../../../crates/server/demo/definitions.json', import.meta.url), 'utf8'),
) as DefsJson

function productField(id: string) {
  const field = fieldCatalogForType(demo, 'product').find((item) => item.id === id)
  expect(field).toBeTruthy()
  return field!
}

describe('Select fields search on group paths', () => {
  it('matches any segment of the full path, not only the leaf group', () => {
    const caffeine = productField('caffeine')
    const cocoa = productField('cocoa_content')
    expect(fieldMatchesQuery(caffeine, 'beverages')).toBe(true)
    expect(fieldMatchesQuery(caffeine, 'food')).toBe(true)
    expect(fieldMatchesQuery(caffeine, 'coffee')).toBe(true)
    expect(fieldMatchesQuery(caffeine, 'snacks')).toBe(false)
    expect(fieldMatchesQuery(cocoa, 'snacks')).toBe(true)
    expect(fieldMatchesQuery(cocoa, 'chocolate')).toBe(true)
  })
})