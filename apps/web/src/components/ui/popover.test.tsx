// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

afterEach(() => {
  cleanup()
})

function Harness() {
  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <button type="button" data-testid="popover-trigger">Open picker</button>
      </PopoverTrigger>
      <PopoverContent data-testid="popover-content" aria-label="Picker">
        <button type="button">First choice</button>
      </PopoverContent>
    </Popover>
  )
}

it('opens with a labelled dialog, closes on Escape and returns focus to the trigger', async () => {
  render(<Harness />)
  const trigger = screen.getByTestId('popover-trigger')
  fireEvent.click(trigger)

  const content = await screen.findByTestId('popover-content')
  expect(content.getAttribute('role')).toBe('dialog')
  expect(content.getAttribute('aria-label')).toBe('Picker')

  fireEvent.keyDown(content, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByTestId('popover-content')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})
