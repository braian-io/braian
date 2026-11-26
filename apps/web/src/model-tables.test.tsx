// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copy } from './i18n'
import { UnitsTable, ValueListsTable, valueListOptions } from './model-tables'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  const use = (impl: (path: string, init?: { body?: unknown; params?: { path?: Record<string, string> } }) => unknown) => {
    for (const fn of Object.values(methods)) fn.mockReset().mockImplementation(impl)
  }
  const calls = () => Object.values(methods).flatMap((fn) => fn.mock.calls)
  return { methods, use, calls }
})
const stageModel = vi.hoisted(() => vi.fn(async () => undefined))
const reviewDraft = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

vi.mock('./model-stage', async () => {
  const actual = await vi.importActual<typeof import('./model-stage')>('./model-stage')
  return { ...actual, stageModel, reviewDraft }
})

const definitions = {
  types: [],
  attributes: [],
  value_lists: [
    {
      key: 'colour',
      labels: { en: 'Colour' },
      options: [
        { code: 'red', labels: { en: 'Red' } },
        { code: 'blue', labels: { en: 'Blue' } },
      ],
    },
  ],
  unit_families: [],
  structures: [],
}

function Host({ onOpenList }: { onOpenList?: (key: string) => void }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <ValueListsTable onOpenList={onOpenList} />
    </QueryClientProvider>
  )
}

describe('value lists table', () => {
  beforeEach(() => {
    mock.use((path) => {
      if (path === '/v1/definitions') return Promise.resolve(definitions)
      if (path === '/v1/model/draft') return Promise.resolve({ count: 0, conflict: false, steps: [] })
      return Promise.resolve({})
    })
    stageModel.mockClear()
    reviewDraft.mockClear()
  })

  afterEach(() => cleanup())

  it('lists value lists and opens master-detail on activate', async () => {
    const opened: string[] = []
    const events: string[] = []
    const onEvent = (event: Event) => {
      events.push(String((event as CustomEvent<{ key?: string }>).detail?.key ?? ''))
    }
    window.addEventListener('braian-open-value-list', onEvent)
    render(<Host onOpenList={(key) => opened.push(key)} />)
    await screen.findByTestId('value-lists-table')
    expect(screen.getByText('Colour')).toBeTruthy()
    fireEvent.click(screen.getByText('Colour'))
    await waitFor(() => {
      expect(opened).toEqual(['colour'])
      expect(events).toEqual(['colour'])
    })
    window.removeEventListener('braian-open-value-list', onEvent)
  })

  it('creates a value list from the plus dialog', async () => {
    render(<Host />)
    await screen.findByTestId('value-lists-table')
    fireEvent.click(screen.getByTestId('table-add-row'))
    const dialog = await screen.findByRole('dialog', { name: copy.newValueList })
    fireEvent.change(within(dialog).getByRole('textbox', { name: copy.name }), { target: { value: 'Shade' } })
    fireEvent.click(within(dialog).getByTestId('create-object'))
    await waitFor(() => expect(stageModel).toHaveBeenCalledWith('model.create_value_list', {
      key: 'shade',
      label: 'Shade',
      language: 'en',
    }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('reads options for a list key', () => {
    const rows = valueListOptions(definitions, 'colour')
    expect(rows.map((row) => row.code)).toEqual(['red', 'blue'])
    expect(copy.valueListValues).toBe('List values')
  })
})

function UnitsHost() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <UnitsTable />
    </QueryClientProvider>
  )
}

describe('units table', () => {
  beforeEach(() => {
    mock.use((path) => {
      if (path === '/v1/definitions') return Promise.resolve(definitions)
      if (path === '/v1/model/draft') return Promise.resolve({ count: 0, conflict: false, steps: [] })
      return Promise.resolve({})
    })
    stageModel.mockClear()
    reviewDraft.mockClear()
  })

  afterEach(() => cleanup())

  it('creates a family with offset, symbol and labels', async () => {
    render(<UnitsHost />)
    await screen.findByTestId('units-table')
    fireEvent.click(screen.getByTestId('table-add-row'))
    const dialog = await screen.findByRole('dialog', { name: copy.newUnit })
    expect(dialog.textContent).toContain(copy.newUnitHint)
    expect(dialog.textContent).not.toContain(copy.createNameHint)
    fireEvent.change(within(dialog).getByTestId('new-name'), { target: { value: 'heat' } })
    fireEvent.change(within(dialog).getByTestId('new-key'), { target: { value: 'C' } })
    fireEvent.change(within(dialog).getByTestId('new-factor'), { target: { value: '1,5' } })
    fireEvent.change(within(dialog).getByTestId('new-offset'), { target: { value: '0' } })
    fireEvent.change(within(dialog).getByTestId('new-symbol'), { target: { value: '°C' } })
    fireEvent.change(within(dialog).getByTestId('new-labels'), { target: { value: 'Celsius' } })
    fireEvent.click(within(dialog).getByTestId('create-object'))
    await waitFor(() => expect(stageModel).toHaveBeenCalledWith('model.create_unit_family', {
      key: 'heat',
      dimension: 'heat',
      base_unit: 'C',
      units: [{ code: 'C', factor: '1.5', offset: '0', symbol: '°C', label: 'Celsius' }],
    }))
  })

  it('rejects a factor that is not a number and keeps the dialog open', async () => {
    render(<UnitsHost />)
    await screen.findByTestId('units-table')
    fireEvent.click(screen.getByTestId('table-add-row'))
    const dialog = await screen.findByRole('dialog', { name: copy.newUnit })
    fireEvent.change(within(dialog).getByTestId('new-name'), { target: { value: 'heat' } })
    fireEvent.change(within(dialog).getByTestId('new-factor'), { target: { value: 'abc' } })
    fireEvent.click(within(dialog).getByTestId('create-object'))
    expect((await within(dialog).findByTestId('validation-error')).textContent).toContain(copy.linkFieldNumber)
    expect(stageModel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: copy.newUnit })).toBeTruthy()
  })

  it('adds a unit when the family already exists', async () => {
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          ...definitions,
          unit_families: [{ key: 'heat', base_unit: 'C', units: [{ code: 'C', factor: '1', symbol: '°C', labels: { en: 'Celsius' } }] }],
        })
      }
      if (path === '/v1/model/draft') return Promise.resolve({ count: 0, conflict: false, steps: [] })
      return Promise.resolve({})
    })
    render(<UnitsHost />)
    await screen.findByText('Celsius')
    fireEvent.click(screen.getByTestId('table-add-row'))
    const dialog = await screen.findByRole('dialog', { name: copy.newUnit })
    fireEvent.change(within(dialog).getByTestId('new-name'), { target: { value: 'heat' } })
    fireEvent.change(within(dialog).getByTestId('new-key'), { target: { value: 'F' } })
    fireEvent.change(within(dialog).getByTestId('new-factor'), { target: { value: '0,5555555555555555555555555556' } })
    fireEvent.change(within(dialog).getByTestId('new-offset'), { target: { value: '-17,777777777777777777777777778' } })
    fireEvent.change(within(dialog).getByTestId('new-symbol'), { target: { value: '°F' } })
    fireEvent.change(within(dialog).getByTestId('new-labels'), { target: { value: 'Fahrenheit' } })
    fireEvent.click(within(dialog).getByTestId('create-object'))
    await waitFor(() => expect(stageModel).toHaveBeenCalledWith('model.add_unit', {
      unit_family: 'heat',
      code: 'F',
      factor: '0.5555555555555555555555555556',
      offset: '-17.777777777777777777777777778',
      symbol: '°F',
      label: 'Fahrenheit',
    }))
  })
})
