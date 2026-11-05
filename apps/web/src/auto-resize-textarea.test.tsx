// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AutoResizeTextarea, resizeTextarea } from './auto-resize-textarea'

afterEach(() => cleanup())

function stubScrollHeight(element: HTMLElement, height: number) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => height })
}

describe('auto resize textarea', () => {
  it('sizes the element from its scroll height', () => {
    const area = document.createElement('textarea')
    stubScrollHeight(area, 120)

    resizeTextarea(area)

    expect(area.style.height).toBe('120px')
  })

  it('re-measures when the value changes and on input', () => {
    const view = render(<AutoResizeTextarea data-testid="area" value="short" readOnly />)
    const area = view.getByTestId('area') as HTMLTextAreaElement

    stubScrollHeight(area, 64)
    view.rerender(<AutoResizeTextarea data-testid="area" value="longer" readOnly />)
    expect(area.style.height).toBe('64px')

    stubScrollHeight(area, 150)
    fireEvent.input(area)
    expect(area.style.height).toBe('150px')
  })
})
