// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BulkWriteConfirm, bulkWriteImpact } from './bulk-write'

afterEach(() => cleanup())

describe('bulk write confirm', () => {
  it('describes the field and object count', () => {
    expect(bulkWriteImpact('status', 3)).toBe('This changes status on 3 objects')
  })

  it('does not write before the danger confirm button is used', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
