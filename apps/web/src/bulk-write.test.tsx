// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BulkWriteConfirm, bulkWriteImpact } from './bulk-write'

afterEach(() => cleanup())

describe('bulk write confirm', () => {
  it('describes the field and object count', () => {
    expect(bulkWriteImpact('status', 3)).toBe('This changes status on 3 objects')
  })

  it('does not write before Save is used', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <BulkWriteConfirm open field="status" count={3} onCancel={onCancel} onConfirm={onConfirm} />,
    )

    expect(screen.getByTestId('bulk-write-impact').textContent).toBe('This changes status on 3 objects')
    expect(screen.getByTestId('bulk-write-confirm-button').className).toContain('btn-danger')
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)

    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows a caller-supplied count sentence and still writes only on Save', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <BulkWriteConfirm
        open
        field="Status"
        count={12}
        title="Set field"
        impact="Set Status on 12 products?"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Set field' })).toBeTruthy()
    expect(screen.getByTestId('bulk-write-impact').textContent).toBe('Set Status on 12 products?')
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
