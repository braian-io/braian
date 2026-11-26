// @vitest-environment jsdom
import { fireEvent, render, screen, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AttributeFieldLabel } from './attribute-field-label'
import { TooltipProvider } from './components/ui/tooltip'

function host(ui: ReactNode): RenderResult {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

describe('AttributeFieldLabel', () => {
  it('keeps description in a tooltip instead of inline copy', () => {
    host(
      <AttributeFieldLabel description="Editor help" descTestId="field-desc-x">
        Ingredients
      </AttributeFieldLabel>,
    )
    expect(screen.queryByTestId('field-desc-x')).toBeNull()
    expect(screen.getByText('Editor help')).toBeTruthy()
    expect(screen.getByText('Editor help').className).toContain('sr-only')
    const label = screen.getByText('Ingredients')
    fireEvent.mouseEnter(label)
    fireEvent.focus(label)
    const tip = screen.getByTestId('field-desc-x')
    expect(tip.textContent).toBe('Editor help')
  })

  it('renders a plain label when there is no description', () => {
    host(<AttributeFieldLabel>Number</AttributeFieldLabel>)
    const label = screen.getByText('Number')
    expect(label.tagName).toBe('LABEL')
    expect(label.getAttribute('tabindex')).toBeNull()
  })
})