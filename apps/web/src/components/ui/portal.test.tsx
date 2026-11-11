// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Portal } from './portal'

afterEach(() => {
  cleanup()
})

describe('Portal', () => {
  it('renders outside the pane and directly on document.body', () => {
    const { container } = render(
      <section className="pane">
        <Portal>
          <div data-testid="overlay">Overlay</div>
        </Portal>
      </section>,
    )

    const overlay = screen.getByTestId('overlay')
    expect(overlay.parentElement).toBe(document.body)
    expect(container.querySelector('[data-testid="overlay"]')).toBeNull()
    expect(container.querySelector('section.pane')).not.toBeNull()
  })

  it('keeps theme variables and existing selectors working', () => {
    document.documentElement.style.setProperty('--raised', 'rgb(1, 2, 3)')
    render(
      <Portal>
        <div className="palette" data-testid="themed" style={{ background: 'var(--raised)' }} />
      </Portal>,
    )

    const themed = screen.getByTestId('themed')
    expect(themed.classList.contains('palette')).toBe(true)
    expect(themed.style.background).toBe('var(--raised)')
    expect(document.documentElement.style.getPropertyValue('--raised')).toBe('rgb(1, 2, 3)')
    document.documentElement.style.removeProperty('--raised')
  })

  it('honours an explicit container', () => {
    const host = document.createElement('div')
    document.body.append(host)
    render(
      <Portal container={host}>
        <span data-testid="custom">Custom</span>
      </Portal>,
    )
    expect(screen.getByTestId('custom').parentElement).toBe(host)
    host.remove()
  })
})
