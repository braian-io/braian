// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { copy } from '../i18n'
import { FieldPicker, type PickerRow } from './field-picker'

afterEach(() => {
  cleanup()
})

function footOf(mode: 'columns' | 'single') {
  render(
    <FieldPicker
      mode={mode}
      crumbs={[]}
      query=""
      onQuery={() => undefined}
      rows={[]}
      active={0}
      onActive={() => undefined}
      onKeyDown={() => undefined}
    />,
  )
  return screen.getByTestId('fields-mode-foot')
}

function PickerHarness() {
  const rows: PickerRow[] = [
    { id: 'first', title: 'First', run: () => undefined },
    { id: 'net_weight', title: 'Net weight', drill: true, run: () => undefined },
  ]
  const [active, setActive] = useState(0)
  return (
    <FieldPicker
      mode="columns"
      crumbs={[]}
      query=""
      onQuery={() => undefined}
      rows={rows}
      active={active}
      onActive={setActive}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') setActive((prev) => Math.min(prev + 1, rows.length - 1))
        if (event.key === 'ArrowUp') setActive((prev) => Math.max(prev - 1, 0))
      }}
    />
  )
}

function isActive(testId: string) {
  return screen.getByTestId(testId).getAttribute('data-active') === 'true'
}

describe('field picker hover arming', () => {
  it('ignores hover until the pointer moves, then honors it until the next key', () => {
    render(<PickerHarness />)
    const input = screen.getByTestId('fields-mode-input')
    const first = screen.getByTestId('fields-row-first')
    const net = screen.getByTestId('fields-row-net_weight')

    // A leftover cursor (e.g. after the context menu closed over a row) must not move the highlight.
    fireEvent.mouseOver(net)
    expect(isActive('fields-row-first')).toBe(true)
    expect(isActive('fields-row-net_weight')).toBe(false)

    // A real pointer move arms hover.
    fireEvent.mouseMove(net)
    expect(isActive('fields-row-net_weight')).toBe(true)

    // Keyboard takes over: hover is ignored again until the pointer moves.
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(isActive('fields-row-first')).toBe(true)
    fireEvent.mouseOver(net)
    expect(isActive('fields-row-first')).toBe(true)
    expect(isActive('fields-row-net_weight')).toBe(false)

    // The next pointer move arms hover again.
    fireEvent.mouseMove(net)
    expect(isActive('fields-row-net_weight')).toBe(true)

    // Once armed, plain hover still changes the highlight (no extra move needed).
    fireEvent.mouseOver(first)
    expect(isActive('fields-row-first')).toBe(true)
  })
})

describe('field picker copy', () => {
  it('renders the foot hints from copy', () => {
    const foot = footOf('columns')
    expect(foot.textContent).toContain(copy.toggleOpen)
    expect(foot.textContent).toContain(copy.drill)
    expect(foot.textContent).toContain(copy.back)
    expect(foot.textContent).toContain(copy.close)
    expect(foot.textContent).not.toContain('toggle / open')
  })

  it('picks with copy.pick in single mode', () => {
    expect(footOf('single').textContent).toContain(copy.pick)
  })
})
