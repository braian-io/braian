// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldDiff } from './field-diff-view'

describe('FieldDiff proposal values', () => {
  it('puts the full new value in a title tooltip', () => {
    const long = 'Winter assortment name that is far too long for one narrow proposal card line'
    render(
      <FieldDiff
        lines={[
          { id: 'name', label: 'Name', before: 'Old', after: long },
          { id: 'note', label: 'Note', before: '', after: long, change: 'add' },
        ]}
      />,
    )
    const news = screen.getAllByTestId('diff-new')
    expect(news).toHaveLength(2)
    expect(news[0]?.getAttribute('title')).toBe(long)
    expect(news[0]?.textContent).toBe(long)
    expect(news[1]?.getAttribute('title')).toBe(long)
    expect(news[1]?.textContent).toBe(`+ ${long}`)
  })
})
