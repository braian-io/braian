// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DetailFieldDraftHost, type DetailFieldDraftHandle } from './detail-field-draft'
import { DetailNumberMeasureField } from './detail-number-measure-field'

afterEach(() => cleanup())

describe('DetailNumberMeasureField skip-blur', () => {
  it('commits after Escape when the user types again and blurs', async () => {
    const hostRef = { current: null as DetailFieldDraftHandle | null }
    const onChange = vi.fn()
    render(
      <DetailFieldDraftHost ref={hostRef}>
        <DetailNumberMeasureField fieldKey="energy" value={{ value: '10', unit: 'kJ' }} units={['kJ']} onChange={onChange} />
      </DetailFieldDraftHost>,
    )
    const input = screen.getByTestId('detail-measure-value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '99' } })
    hostRef.current?.discard()
    await waitFor(() => expect(input.value).toBe('10'))
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ value: '2', unit: 'kJ' })
  })

  it('commits after discard and unit change when the value is edited before blur', async () => {
    let record: { value: string; unit: string } = { value: '10', unit: 'kJ' }
    const onChange = vi.fn((next: unknown) => {
      record = next as { value: string; unit: string }
    })
    const view = () => (
      <DetailNumberMeasureField fieldKey="energy" value={record} units={['kJ', 'kcal']} onChange={onChange} />
    )
    const { rerender } = render(view())
    const input = screen.getByTestId('detail-measure-value') as HTMLInputElement
    fireEvent.click(screen.getByRole('combobox', { name: /unit/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'kcal' }))
    rerender(view())
    onChange.mockClear()
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ value: '3', unit: 'kcal' })
  })
})

describe('DetailNumberMeasureField unchanged blur', () => {
  it('does not stage when the user retypes the same number with a comma decimal', () => {
    const onChange = vi.fn()
    render(
      <DetailNumberMeasureField
        fieldKey="energy"
        value={{ value: '485.181644', unit: 'kJ' }}
        units={['kJ']}
        onChange={onChange}
      />,
    )
    const input = screen.getByTestId('detail-measure-value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '485,181644' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('485.181644')
  })

  it('does not stage when the user adds a trailing zero', () => {
    const onChange = vi.fn()
    render(
      <DetailNumberMeasureField
        fieldKey="energy"
        value={{ value: '10', unit: 'kJ' }}
        units={['kJ']}
        onChange={onChange}
      />,
    )
    const input = screen.getByTestId('detail-measure-value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '10.0' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('10')
  })
})

describe('DetailNumberMeasureField flush', () => {
  it('does not block save for an empty untouched field', () => {
    const hostRef = { current: null as DetailFieldDraftHandle | null }
    render(
      <DetailFieldDraftHost ref={hostRef}>
        <DetailNumberMeasureField fieldKey="co2" value={{ value: '', unit: 'kg' }} units={['kg']} onChange={() => undefined} />
        <DetailNumberMeasureField fieldKey="energy" value={{ value: '10', unit: 'kJ' }} units={['kJ']} onChange={() => undefined} />
      </DetailFieldDraftHost>,
    )
    const energy = screen.getByTestId('detail-measure-field-energy').querySelector('[data-testid="detail-measure-value"]') as HTMLInputElement
    fireEvent.change(energy, { target: { value: '11' } })
    expect(hostRef.current?.flush()).toBe(true)
  })

  it('fails flush when the user cleared a committed value', async () => {
    const hostRef = { current: null as DetailFieldDraftHandle | null }
    render(
      <DetailFieldDraftHost ref={hostRef}>
        <DetailNumberMeasureField fieldKey="energy" value={{ value: '10', unit: 'kJ' }} units={['kJ']} onChange={() => undefined} />
      </DetailFieldDraftHost>,
    )
    const input = screen.getByTestId('detail-measure-value')
    fireEvent.change(input, { target: { value: '' } })
    expect(hostRef.current?.flush()).toBe(false)
    await waitFor(() => {
      expect(screen.getByTestId('detail-measure-value').getAttribute('aria-invalid')).toBe('true')
    })
  })
})