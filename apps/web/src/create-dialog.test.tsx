// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateDialog } from './create-dialog'

afterEach(() => cleanup())

function Host({
  onSubmit,
  initial = 'ART-1',
}: {
  onSubmit: () => Promise<void>
  initial?: string
}) {
  const [open, setOpen] = useState(true)
  const [number, setNumber] = useState(initial)
  if (!open) return <button type="button">closed</button>
  return (
    <CreateDialog
      open
      title="New product"
      description="Enter a number and a name."
      fields={[{ id: 'number', label: 'Number', value: number, testId: 'new-number', autoFocus: true }]}
      onField={(_id, value) => setNumber(value)}
      onClose={() => setOpen(false)}
      onSubmit={onSubmit}
    />
  )
}

describe('create dialog', () => {
  it('keeps the typed value and shows a server error', async () => {
    render(<Host onSubmit={async () => { throw new Error('number already exists') }} />)
    expect(screen.getByLabelText('Number')).toBe(screen.getByTestId('new-number'))
    expect(document.activeElement).toBe(screen.getByTestId('new-number'))
    fireEvent.click(screen.getByTestId('create-object'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('number already exists')
    expect((screen.getByLabelText('Number') as HTMLInputElement).value).toBe('ART-1')
    expect(screen.getByRole('dialog', { name: 'New product' })).toBeTruthy()
  })

  it('disables save while the write is in flight and Escape still closes', async () => {
    let release: () => void = () => undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    render(<Host onSubmit={() => pending} />)
    fireEvent.click(screen.getByTestId('create-object'))
    await waitFor(() => expect((screen.getByTestId('create-object') as HTMLButtonElement).disabled).toBe(true))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    release()
    await pending
  })

  it('submits on Enter and closes after a successful save', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(<Host onSubmit={onSubmit} />)
    fireEvent.submit(screen.getByTestId('new-number').closest('form')!)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
