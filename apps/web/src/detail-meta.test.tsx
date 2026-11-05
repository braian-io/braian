// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DetailMeta, formatMetaTime, metaLine, principalName } from './detail-meta'

afterEach(() => cleanup())

describe('detail meta', () => {
  it('formats timestamps as YYYY-MM-DD HH:mm in the given time zone', () => {
    const iso = '2026-06-15T18:30:00.000Z'
    expect(formatMetaTime(iso, 'Europe/Stockholm')).toBe('2026-06-15 20:30')
    expect(formatMetaTime(iso, 'America/New_York')).toBe('2026-06-15 14:30')
    expect(formatMetaTime('not-a-date')).toBe('not-a-date')
    expect(formatMetaTime('')).toBe('')
  })

  it('reads the principal display name', () => {
    expect(principalName({ id: 'p', name: 'Demo Admin', kind: 'person' })).toBe('Demo Admin')
    expect(principalName({ id: 'a', name: 'Catalog agent', kind: 'agent' })).toBe('Catalog agent')
    expect(principalName(null)).toBe('')
  })

  it('joins created, updated and updated by into one line', () => {
    expect(
      metaLine({
        createdAt: '2026-06-15T18:30:00.000Z',
        updatedAt: '2026-06-15T19:00:00.000Z',
        updatedBy: { name: 'Demo Admin' },
        timeZone: 'UTC',
      }),
    ).toBe('Created 2026-06-15 18:30 · Updated 2026-06-15 19:00 by Demo Admin')
  })

  it('renders plain read-only text without fields or inputs', () => {
    render(
      <DetailMeta
        createdAt="2026-06-15T18:30:00.000Z"
        updatedAt="2026-06-15T19:00:00.000Z"
        updatedBy={{ name: 'Demo Admin' }}
        timeZone="UTC"
      />,
    )
    const meta = screen.getByTestId('object-meta')
    expect(meta.tagName).toBe('P')
    expect(meta.textContent).toBe('Created 2026-06-15 18:30 · Updated 2026-06-15 19:00 by Demo Admin')
    expect(meta.querySelector('input, textarea, [contenteditable="true"]')).toBeNull()
  })

  it('renders nothing when there is no metadata', () => {
    render(<DetailMeta />)
    expect(screen.queryByTestId('object-meta')).toBeNull()
  })
})
