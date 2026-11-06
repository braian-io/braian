// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cellTitle } from './panes'

describe('cellTitle', () => {
  it('uses only the object name when a suggestion badge sits beside it', () => {
    const node = (
      <span>
        <span className="cell-name">Mature cheddar</span>
        <span className="suggestion-count" data-testid="suggestion-count" aria-hidden="true">1 suggested</span>
      </span>
    )
    expect(cellTitle(node)).toBe('Mature cheddar')
  })

  it('skips suggestion-count nodes even without aria-hidden', () => {
    const node = (
      <span>
        Mature cheddar
        <span className="suggestion-count">1 suggested</span>
      </span>
    )
    expect(cellTitle(node)).toBe('Mature cheddar')
  })

  it('skips aria-hidden nodes', () => {
    const node = (
      <span>
        Mature cheddar
        <span aria-hidden="true">1 suggested</span>
      </span>
    )
    expect(cellTitle(node)).toBe('Mature cheddar')
  })
})
