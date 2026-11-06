// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { copy } from '../i18n'
import { FieldPicker } from './field-picker'

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
