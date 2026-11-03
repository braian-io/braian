// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copy } from './i18n'
import { DataModel } from './data-model'
import { chooseModelSelection } from './model-selection'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return { methods }
})
const stageModel = vi.hoisted(() => vi.fn(async () => undefined))
const stageModelSteps = vi.hoisted(() => vi.fn(async () => undefined))
const requestReview = vi.hoisted(() => vi.fn())

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

vi.mock('./model-stage', async () => {
  const actual = await vi.importActual<typeof import('./model-stage')>('./model-stage')
  return { ...actual, stageModel, stageModelSteps, requestReview }
})

const standardName = {
  id: '018f0000-0000-7000-8000-000000000101',
  key: 'name',
  labels: { en: 'Name' },
  language_dependent: true,
  multiple: false,
  required: false,
  kind: { type: 'text' },
  index: { searchable: true, filterable: false, sortable: false },
}

const ownText = {
  id: 'attribute-b',
  key: 'own_b',
  labels: { en: 'Beta' },
  language_dependent: false,
  multiple: false,
  required: false,
  kind: { type: 'text' },
  index: { searchable: false, filterable: false, sortable: false },
}

const ownBoolean = {
  id: 'attribute-a',
  key: 'own_a',
  labels: { en: 'Alpha' },
  language_dependent: false,
  multiple: false,
  required: false,
  kind: { type: 'boolean' },
  index: { searchable: false, filterable: false, sortable: false },
}

const definitions = {
  types: [
    {
      id: 'type-recipe',
      key: 'recipe',
      kind: 'object',
      singular: { en: 'Recipe' },
      plural: { en: 'Recipes' },
      labels: { en: 'Recipe' },
      attributes: ['attribute-b', standardName.id, 'attribute-a'],
      key_attribute: 'attribute-b',
    },
  ],
  attributes: [standardName, ownText, ownBoolean],
  unit_families: [],
  value_lists: [],
  structures: [
    {
      id: 'structure-food',
      key: 'food',
      labels: { en: 'Food' },
      groups: [
        { id: 'group-dairy', key: 'dairy', labels: { en: 'Dairy' }, attributes: ['parent-attribute'] },
        { id: 'group-yoghurt', key: 'yoghurt', labels: { en: 'Yoghurt' }, parent: 'group-dairy', attributes: ['child-attribute'] },
      ],
      classes: [],
    },
  ],
  definitions_extra: [
    { id: 'parent-attribute', key: 'fat_content', labels: { en: 'Fat content' } },
    { id: 'child-attribute', key: 'sugar', labels: { en: 'Sugar' } },
  ],
}

const allAttributes = [
  ...definitions.attributes,
  {
    id: 'parent-attribute',
    key: 'fat_content',
    labels: { en: 'Fat content' },
    language_dependent: false,
    multiple: false,
    required: false,
    kind: { type: 'text' },
    index: { searchable: false, filterable: false, sortable: false },
  },
  {
    id: 'child-attribute',
    key: 'sugar',
    labels: { en: 'Sugar' },
    language_dependent: false,
    multiple: false,
    required: false,
    kind: { type: 'text' },
    index: { searchable: false, filterable: false, sortable: false },
  },
]

function Host() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <DataModel view={{ state: { mode: 'classes' } }} />
    </QueryClientProvider>
  )
}

function row(root: HTMLElement, id: string) {
  const found = root.querySelector(`[data-row-id="${id}"]`)
  if (!(found instanceof HTMLElement)) throw new Error(`missing row ${id}`)
  return found
}

describe('type attributes table', () => {
  beforeEach(() => {
    mock.methods.get.mockReset().mockImplementation((path: string) => {
      if (path === '/v1/definitions') return Promise.resolve({ ...definitions, attributes: allAttributes })
      if (path === '/v1/model/draft') return Promise.resolve({ count: 0, conflict: false, steps: [] })
      return Promise.resolve({})
    })
    stageModel.mockClear()
    stageModelSteps.mockClear()
    requestReview.mockClear()
  })

  afterEach(() => cleanup())

  it('shows standard attributes first with a locked key and no section header', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    const { container } = render(<Host />)
    await screen.findByTestId('attribute-table')
    const rows = [...container.querySelectorAll('[data-row-id]')]
    expect(rows.map((node) => node.getAttribute('data-row-id'))).toEqual([standardName.id, ownText.id, ownBoolean.id])
    const key = screen.getByTestId('attr-key-name')
    expect(key.querySelector('.attr-key-lock')).toBeTruthy()
    expect(key.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText(copy.standardAttributes)).toBeNull()
  })

  it('reorders own attributes and saves a checkbox change in one review', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    const { container } = render(<Host />)
    await screen.findByTestId('attribute-table')
    fireEvent.click(within(row(container, ownText.id)).getByLabelText('Move row down'))
    fireEvent.click(within(row(container, ownBoolean.id)).getByRole('checkbox', { name: copy.searchable }))
    fireEvent.click(screen.getByTestId('review-and-save'))
    await waitFor(() => expect(stageModel).toHaveBeenCalledWith('model.reorder_type_attributes', {
      type: 'recipe',
      attributes: ['name', 'own_a', 'own_b'],
    }))
    expect(stageModel).toHaveBeenCalledWith('model.update_attribute', { key: 'own_a', searchable: true })
    expect(requestReview).toHaveBeenCalled()
  })

  it('adds a draft row and stages create and attach on review', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    const { container } = render(<Host />)
    await screen.findByTestId('attribute-table')
    fireEvent.click(screen.getByTestId('table-add-row'))
    await waitFor(() => expect(container.querySelector('input[data-testid^="attr-label-"]')).toBeTruthy())
    const editor = container.querySelector('input[data-testid^="attr-label-"]')
    if (!(editor instanceof HTMLInputElement)) throw new Error('missing new row editor')
    fireEvent.change(editor, { target: { value: 'Extra' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    fireEvent.click(screen.getByTestId('review-and-save'))
    await waitFor(() => expect(stageModel).toHaveBeenCalledWith('model.create_attribute', expect.objectContaining({
      key: 'extra',
      label: 'Extra',
      kind: 'text',
    })))
    expect(stageModel).toHaveBeenCalledWith('model.attach_attribute', { attribute: 'extra', type: 'recipe' })
  })

  it('dims inherited rows and shows the From column for a group', async () => {
    chooseModelSelection({ kind: 'group', structure: 'food', group: 'yoghurt' })
    const { container } = render(<Host />)
    await screen.findByTestId('attribute-table')
    const inherited = row(container, 'parent-attribute')
    expect(inherited.getAttribute('data-readonly')).toBe('true')
    expect(inherited.className).toContain('read-only')
    expect(within(inherited).getByTestId('attribute-from').textContent).toContain('Dairy')
    expect(screen.getByRole('columnheader', { name: copy.from })).toBeTruthy()
    expect(screen.getByTestId('table-add-row')).toBeTruthy()
    expect(screen.queryByLabelText('Move row up')).toBeNull()
  })
})
