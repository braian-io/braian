// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { HelpDialog } from './help-dialog'

afterEach(() => {
  cleanup()
})

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" data-testid="help-trigger" onClick={() => setOpen(true)}>Help</button>
      {open ? <HelpDialog onClose={() => setOpen(false)} placeholder="Search" /> : null}
    </>
  )
}

it('is a titled dialog that closes on Escape and returns focus to where F1 was pressed', async () => {
  render(<Harness />)
  const trigger = screen.getByTestId('help-trigger')
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'F1' })
  fireEvent.click(trigger)

  const dialog = await screen.findByRole('dialog')
  expect(screen.getByText('Keyboard shortcuts')).toBeTruthy()
  expect(dialog.getAttribute('data-testid')).toBe('help-shortcuts')

  fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByTestId('help-shortcuts')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})
