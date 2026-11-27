// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FieldDiff } from './field-diff-view'

afterEach(() => cleanup())

describe('FieldDiff compact values', () => {
  it('truncates long values and expands on click', () => {
    const long = 'x'.repeat(120)
    render(<FieldDiff compact lines={[{
      id: 'number',
      label: 'Number',
      before: long,
      after: 'short',
    }]} />)
    const old = screen.getByText(new RegExp(`${'x'.repeat(96)}…`))
    expect(old).toBeTruthy()
    expect(screen.queryByText(long)).toBeNull()
    fireEvent.click(screen.getByTestId('diff-expand'))
    expect(screen.getByText(long)).toBeTruthy()
  })
})