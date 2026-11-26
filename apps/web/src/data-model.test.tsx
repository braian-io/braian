// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { copy } from './i18n'
import { DataModel } from './data-model'
import { ModelDraftHost } from './model-draft-ui'
import { requestAttributeAction } from './attribute-actions'
import { chooseModelSelection, registerModelDefinitions } from './model-selection'
import { StructuresCancelled } from './model-stage'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return { methods }
})
const stageModel = vi.hoisted(() => vi.fn(async () => undefined))
const stageModelSteps = vi.hoisted(() => vi.fn(async () => undefined))
const requestReview = vi.hoisted(() => vi.fn(() => window.dispatchEvent(new Event('braian-review-save'))))

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

function Host({ mode = 'classes' }: { mode?: string }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <DataModel view={{ state: { mode } }} />
    </QueryClientProvider>
  )
}

function HostWithDraftBar({ mode = 'classes' }: { mode?: string } = {}) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <DataModel view={{ state: { mode } }} />
      <ModelDraftHost />
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
    mock.methods.post.mockReset().mockImplementation((path: string) => {
      if (path === '/v1/operations/{name}') {
        return Promise.resolve({
          attributes: allAttributes.map((item) => ({
            id: item.id,
            key: item.key,
            label: item.labels?.en,
            kind: (item.kind as { type?: string })?.type,
            used_in: { objects: item.key === 'name' ? 5 : 0 },
          })),
        })
      }
      return Promise.resolve({})
    })
    mock.methods.put.mockReset()
    stageModel.mockClear()
    stageModelSteps.mockClear()
    requestReview.mockClear()
  })

  afterEach(() => cleanup())

  it('choosing a type after an empty selection still renders the table', async () => {
    registerModelDefinitions({ types: [], structures: [] })
    render(<Host />)
    expect(await screen.findByText(copy.pickModel)).toBeTruthy()
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    await screen.findByTestId('attribute-table')
  })

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

  it('reorders own attributes and saves a checkbox change without a table Save', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    const { container } = render(<Host />)
    await screen.findByTestId('attribute-table')
    fireEvent.click(within(row(container, ownText.id)).getByLabelText('Move row down'))
    fireEvent.click(within(row(container, ownBoolean.id)).getByRole('checkbox', { name: copy.searchable }))
    await waitFor(() => {
      const bodies = mock.methods.post.mock.calls
        .filter((call) => call[0] === '/v1/model/commit')
        .map((call) => call[1]?.body?.steps)
      expect(bodies).toEqual(expect.arrayContaining([
        [{ op: 'reorder_type_attributes', type_key: 'recipe', attributes: ['name', 'own_a', 'own_b'] }],
        [{ op: 'update_attribute', key: 'own_a', searchable: true }],
      ]))
    })
    expect(screen.queryByTestId('review-and-save')).toBeNull()
    expect(stageModel).not.toHaveBeenCalled()
    expect(stageModelSteps).not.toHaveBeenCalled()
    expect(requestReview).not.toHaveBeenCalled()
  })

  it('creates an attribute from the dialog and attaches it on save', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    render(<Host />)
    await screen.findByTestId('attribute-table')
    fireEvent.click(screen.getByTestId('table-add-row'))
    const dialog = await screen.findByRole('dialog', { name: copy.newAttribute })
    fireEvent.change(within(dialog).getByRole('textbox', { name: copy.name }), { target: { value: 'Extra' } })
    fireEvent.click(within(dialog).getByTestId('create-object'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => {
      const posted = mock.methods.post.mock.calls.find((call) => call[0] === '/v1/model/commit')
      expect(posted?.[1]?.body?.steps).toEqual([
        {
          op: 'create_attribute',
          key: 'extra',
          label: 'Extra',
          kind: 'text',
          multiple: false,
          languages: true,
          required: false,
          show_by_default: true,
          searchable: false,
          filterable: false,
          sortable: false,
        },
        { op: 'attach_attribute', attribute: 'extra', type_key: 'recipe' },
      ])
    })
    expect(screen.queryByTestId('review-and-save')).toBeNull()
    expect(stageModel).not.toHaveBeenCalled()
    expect(stageModelSteps).not.toHaveBeenCalled()
    expect(requestReview).not.toHaveBeenCalled()
  })

  it('saves a checkbox immediately and opens review when the attribute is removed', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    const { container } = render(<Host />)
    await screen.findByTestId('attribute-table')
    fireEvent.click(within(row(container, ownBoolean.id)).getByRole('checkbox', { name: copy.searchable }))
    await waitFor(() => {
      const posted = mock.methods.post.mock.calls.find((call) => call[0] === '/v1/model/commit')
      expect(posted?.[1]?.body?.steps).toEqual([{ op: 'update_attribute', key: 'own_a', searchable: true }])
    })
    fireEvent.keyDown(within(row(container, ownBoolean.id)).getByTestId('attr-menu-own_a'), { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: copy.removeFromThisType }))
    await waitFor(() => expect(stageModelSteps).toHaveBeenCalledWith([
      { op: 'detach_attribute', attribute: 'own_a', type_key: 'recipe' },
    ]))
    expect(requestReview).toHaveBeenCalled()
    expect(screen.queryByTestId('review-and-save')).toBeNull()
  })

  it('opens one create dialog and closes it with Escape', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    render(<Host />)
    await screen.findByTestId('attribute-table')

    expect(requestAttributeAction('new')).toBe(true)
    const dialog = await screen.findByRole('dialog', { name: copy.newAttribute })
    expect(requestAttributeAction('new')).toBe(true)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.change(within(dialog).getByRole('textbox', { name: copy.name }), { target: { value: 'Draft' } })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('Draft')).toBeNull()
  })

  it('shows an error when the impact calculation fails', async () => {
    mock.methods.post.mockRejectedValueOnce(new Error('impact failed'))
    render(<Host mode="impact" />)
    fireEvent.click(await screen.findByTestId('impact-run'))
    expect((await screen.findByTestId('impact-error')).textContent).toBe('impact failed')
  })

  it('treats two clicks in a burst as no allowed-trees change', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    render(<Host />)
    const trees = await screen.findByTestId('allowed-trees')
    const checkbox = within(trees).getByRole('checkbox', { name: 'Food' }) as HTMLInputElement
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      fireEvent.click(checkbox)
      fireEvent.click(checkbox)
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(400)
      expect(stageModel).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
    expect(requestReview).not.toHaveBeenCalled()
    expect(checkbox.checked).toBe(false)
  })

  it('stages allowed trees for review on the click, without a table Save', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    render(<Host />)
    const trees = await screen.findByTestId('allowed-trees')
    fireEvent.click(within(trees).getByRole('checkbox', { name: 'Food' }))
    await waitFor(() => expect(stageModel).toHaveBeenCalledWith('model.set_structures', {
      type_key: 'recipe',
      structures: ['structure-food'],
    }))
    expect(screen.queryByTestId('review-and-save')).toBeNull()
    expect(stageModelSteps).not.toHaveBeenCalled()
    expect(requestReview).toHaveBeenCalledTimes(1)
    expect(mock.methods.put).not.toHaveBeenCalled()
  })

  it('stages allowed trees through the table save path without posting save immediately', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    render(<HostWithDraftBar />)
    const trees = await screen.findByTestId('allowed-trees')
    fireEvent.click(within(trees).getByRole('checkbox', { name: 'Food' }))
    expect(screen.queryByTestId('review-and-save')).toBeNull()
    await waitFor(() => expect(stageModel).toHaveBeenCalledWith('model.set_structures', {
      type_key: 'recipe',
      structures: ['structure-food'],
    }))
    expect(stageModelSteps).not.toHaveBeenCalled()
    await waitFor(() => expect(requestReview).toHaveBeenCalled())
    const saves = mock.methods.post.mock.calls.filter((call) => String(call[0]).includes('/v1/model/draft/save'))
    expect(saves).toEqual([])
  })

  it('shows an error when saving allowed trees from the table fails', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    stageModel.mockRejectedValueOnce(new Error('could not save allowed trees'))
    render(<Host />)
    const trees = await screen.findByTestId('allowed-trees')
    fireEvent.click(within(trees).getByRole('checkbox', { name: 'Food' }))
    expect(await screen.findByText('could not save allowed trees')).toBeTruthy()
    expect(screen.queryByTestId('review-and-save')).toBeNull()
    expect(requestReview).not.toHaveBeenCalled()
  })

  it('drops the allowed-trees patch when cancel arrives during the save POST', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    let rejectStage: (reason: unknown) => void = () => {}
    stageModel.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectStage = reject
    }))
    render(<Host />)
    const trees = await screen.findByTestId('allowed-trees')
    const checkbox = within(trees).getByRole('checkbox', { name: 'Food' }) as HTMLInputElement
    fireEvent.click(checkbox)
    await waitFor(() => expect(stageModel).toHaveBeenCalled())
    expect(checkbox.checked).toBe(true)
    window.dispatchEvent(new Event('braian-model-table-draft-discard'))
    await waitFor(() => {
      const current = within(trees).getByRole('checkbox', { name: 'Food' }) as HTMLInputElement
      expect(current.checked).toBe(false)
    })
    rejectStage(new StructuresCancelled())
    await waitFor(() => expect(requestReview).not.toHaveBeenCalled())
    expect(screen.queryByText('could not save allowed trees')).toBeNull()
    expect(screen.queryByTestId('review-and-save')).toBeNull()
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
    expect(screen.getAllByLabelText('Move row up').length).toBeGreaterThan(0)
  })
})

describe('attribute row menu', () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
    Element.prototype.scrollIntoView ??= () => {}
    Element.prototype.hasPointerCapture ??= () => false
  })

  beforeEach(() => {
    mock.methods.get.mockReset().mockImplementation((path: string) => {
      if (path === '/v1/definitions') return Promise.resolve({ ...definitions, attributes: allAttributes })
      if (path === '/v1/model/draft') return Promise.resolve({ count: 0, conflict: false, steps: [] })
      return Promise.resolve({})
    })
    mock.methods.post.mockReset().mockImplementation((path: string) => {
      if (path === '/v1/operations/{name}') {
        return Promise.resolve({
          attributes: allAttributes.map((item) => ({
            id: item.id,
            key: item.key,
            label: item.labels?.en,
            kind: (item.kind as { type?: string })?.type,
            used_in: { objects: item.key === 'name' ? 5 : 0 },
          })),
        })
      }
      return Promise.resolve({})
    })
  })

  afterEach(() => cleanup())

  it('uses type-specific labels for remove and delete', async () => {
    chooseModelSelection({ kind: 'type', typeKey: 'recipe' })
    const { container } = render(<Host />)
    await screen.findByTestId('attribute-table')
    fireEvent.keyDown(within(row(container, ownBoolean.id)).getByTestId('attr-menu-own_a'), { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: copy.removeFromThisType })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: copy.deleteAttributeEverywhere })).toBeTruthy()
    expect(within(menu).queryByRole('menuitem', { name: copy.removeFromHere })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: copy.deleteMenu })).toBeNull()
  })
})
