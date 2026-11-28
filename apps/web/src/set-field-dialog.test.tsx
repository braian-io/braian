// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copy } from './i18n'
import { SetFieldFlow } from './set-field-dialog'
import { setFieldChoices } from './set-field'
import type { Json } from './api'

afterEach(() => cleanup())

const defs: Json = {
  attributes: [
    { id: 'brand', key: 'brand', labels: { en: 'Brand' }, kind: { type: 'text', max_length: 80 } },
    { id: 'days', key: 'lead_time_days', labels: { en: 'Lead time' }, kind: { type: 'number', integer: true } },
    { id: 'status', key: 'status', labels: { en: 'Status' }, kind: { type: 'value_list', list: 'status' } },
  ],
  value_lists: [{ key: 'status', options: [{ code: 'ok', labels: { en: 'OK' } }] }],
  types: [{ key: 'product', attributes: ['brand', 'days', 'status'], plural: { en: 'Products' } }],
}

const choices = setFieldChoices(defs, 'product')

describe('set field dialog', () => {
  it('writes one row directly', () => {
    const onWrite = vi.fn(async () => ({ applied: ['a'], failed: [] }))
    render(
      <SetFieldFlow open count={1} choices={choices} language="en" noun="products" onClose={vi.fn()} onWrite={onWrite} />,
    )
    fireEvent.change(screen.getByTestId('set-field-value'), { target: { value: 'Nordic' } })
    fireEvent.click(screen.getByTestId('set-field-apply'))
    expect(onWrite).toHaveBeenCalledWith({ brand: 'Nordic' })
    expect(screen.queryByTestId('bulk-write-confirm')).toBeNull()
  })

  it('asks for a count confirm and writes nothing when that confirm is cancelled', () => {
    const onWrite = vi.fn(async () => ({ applied: ['a', 'b'], failed: [] }))
    render(
      <SetFieldFlow open count={2} choices={choices} language="en" noun="products" onClose={vi.fn()} onWrite={onWrite} />,
    )
    fireEvent.change(screen.getByTestId('set-field-value'), { target: { value: 'Harbor' } })
    fireEvent.click(screen.getByTestId('set-field-apply'))
    expect(onWrite).not.toHaveBeenCalled()
    expect(screen.getByTestId('bulk-write-impact').textContent).toBe('Set Brand on 2 products?')

    fireEvent.click(within(screen.getByTestId('bulk-write-confirm')).getByRole('button', { name: 'Cancel' }))
    expect(onWrite).not.toHaveBeenCalled()
    expect(screen.queryByTestId('bulk-write-confirm')).toBeNull()
    expect(screen.getByTestId('set-field-dialog')).toBeTruthy()

    fireEvent.click(screen.getByTestId('set-field-apply'))
    fireEvent.click(screen.getByTestId('bulk-write-confirm-button'))
    expect(onWrite).toHaveBeenCalledTimes(1)
    expect(onWrite).toHaveBeenCalledWith({ brand: 'Harbor' })
  })

  it('keeps a bad value in the dialog and does not write it', () => {
    const onWrite = vi.fn(async () => ({ applied: [], failed: [] }))
    render(
      <SetFieldFlow open count={3} choices={choices} language="en" noun="products" onClose={vi.fn()} onWrite={onWrite} />,
    )
    fireEvent.change(screen.getByTestId('set-field-attribute'), { target: { value: 'lead_time_days' } })
    fireEvent.change(screen.getByTestId('set-field-value'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByTestId('set-field-apply'))
    expect(onWrite).not.toHaveBeenCalled()
    expect(screen.queryByTestId('bulk-write-confirm')).toBeNull()
    expect(screen.getByTestId('set-field-error').textContent).toBe(copy.fieldInvalidNumber)
  })

  it('shows an inline error when some rows fail and still reports the ones that saved', async () => {
    const onWrite = vi.fn(async () => ({
      applied: ['a'],
      failed: [{ id: 'b', message: 'version conflict' }],
    }))
    const onClose = vi.fn()
    render(
      <SetFieldFlow open count={2} choices={choices} language="en" noun="products" onClose={onClose} onWrite={onWrite} />,
    )
    fireEvent.change(screen.getByTestId('set-field-value'), { target: { value: 'Nordic' } })
    fireEvent.click(screen.getByTestId('set-field-apply'))
    fireEvent.click(screen.getByTestId('bulk-write-confirm-button'))
    expect((await screen.findByTestId('set-field-error')).textContent).toBe('1 updated. 1 could not be updated. version conflict')
    expect(onClose).not.toHaveBeenCalled()
    expect(onWrite).toHaveBeenCalledTimes(1)
  })
})
