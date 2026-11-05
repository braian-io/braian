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

function SelectHost({ onField }: { onField: (id: string, value: string) => void }) {
  const [from, setFrom] = useState('article')
  return (
    <CreateDialog
      open
      title="New link type"
      description="Pick the ends."
      fields={[
        { id: 'name', label: 'Name', value: 'Bundled', testId: 'new-name', autoFocus: true },
        {
          id: 'from',
          label: 'From type',
          value: from,
          testId: 'new-type',
          options: [
            { value: 'article', label: 'article' },
            { value: 'product', label: 'product' },
          ],
        },
      ]}
      onField={(id, value) => {
        if (id === 'from') setFrom(value)
        onField(id, value)
      }}
      onClose={() => undefined}
      onSubmit={async () => undefined}
    />
  )
}

describe('create dialog select fields', () => {
  it('uses the themed select trigger for option fields', () => {
    render(<SelectHost onField={vi.fn()} />)
    const trigger = screen.getByTestId('new-type')
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('aria-label')).toBe('From type')
    expect(trigger.getAttribute('role')).toBe('combobox')
    expect(trigger.textContent).toContain('article')
  })
})

function MoreHost({ moreFields }: { moreFields?: Array<{ id: string; label: string; value: string; testId: string }> }) {
  return (
    <CreateDialog
      open
      title="New product"
      description="Enter a number and a name."
      fields={[{ id: 'number', label: 'Number', value: '', testId: 'new-number', autoFocus: true }]}
      moreFields={moreFields}
      onField={() => undefined}
      onClose={() => undefined}
      onSubmit={async () => undefined}
    />
  )
}

describe('create dialog show more fields', () => {
  it('reveals and collapses hidden fields', () => {
    render(<MoreHost moreFields={[{ id: 'hidden', label: 'Hidden', value: '', testId: 'new-field-hidden' }]} />)
    expect(screen.queryByTestId('new-field-hidden')).toBeNull()
    fireEvent.click(screen.getByTestId('show-more-fields'))
    expect(screen.getByTestId('new-field-hidden')).toBeTruthy()
    fireEvent.click(screen.getByTestId('show-more-fields'))
    expect(screen.queryByTestId('new-field-hidden')).toBeNull()
  })

  it('has no Show more control without hidden fields', () => {
    render(<MoreHost />)
    expect(screen.queryByTestId('show-more-fields')).toBeNull()
  })
})
