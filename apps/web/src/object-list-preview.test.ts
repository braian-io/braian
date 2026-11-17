import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { Json } from './api'
import {
  buildListPreviewFromRow,
  isListPreview,
  LIST_PREVIEW,
  objectQueryStaleTime,
  seedObjectListPreview,
} from './object-list-preview'
import { OBJECT_FETCH_STALE_MS } from './object-gone'

const defs: Json = {
  languages: ['en'],
  attributes: [
    { id: 'n1', key: 'name', language_dependent: true },
    { id: 's1', key: 'status' },
    { id: 'd1', key: 'description', language_dependent: true },
  ],
}

const row = {
  id: 'obj-1',
  key: 'ART-1',
  type: 'article',
  version: '2',
  name: 'Demo',
  status: 'ok',
  doc: {
    id: 'obj-1',
    key: 'ART-1',
    type_key: 'article',
    version: '2',
    a_name__en: 'Demo',
    a_status: 'ok',
    a_description__en: 'Blurb',
  },
}

describe('object list preview', () => {
  it('builds a partial object marked as list preview', () => {
    const preview = buildListPreviewFromRow(row, defs, 'en')
    expect(preview[LIST_PREVIEW]).toBe(true)
    expect(preview.id).toBe('obj-1')
    expect((preview.values as Json).number).toBe('ART-1')
    expect(((preview.values as Json).name as Json).en).toBe('Demo')
    expect((preview.values as Json).description).toEqual({ en: 'Blurb' })
    expect(isListPreview(preview)).toBe(true)
  })

  it('does not replace a full cached object when seeding', () => {
    const client = new QueryClient()
    const full = { id: 'obj-1', key: 'ART-1', type: 'article', version: 3, values: {}, links: [] }
    client.setQueryData(['object', 'obj-1'], full)
    seedObjectListPreview(client, buildListPreviewFromRow(row, defs, 'en'))
    expect(client.getQueryData(['object', 'obj-1'])).toBe(full)
  })

  it('replaces an older preview with a newer preview', () => {
    const client = new QueryClient()
    const older = { ...buildListPreviewFromRow({ ...row, version: '1' }, defs, 'en') }
    client.setQueryData(['object', 'obj-1'], older)
    const newer = buildListPreviewFromRow(row, defs, 'en')
    seedObjectListPreview(client, newer)
    expect(client.getQueryData(['object', 'obj-1'])).toEqual(newer)
  })
})