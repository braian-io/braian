// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { copy } from './i18n'
import { allowedTreeStepIndexes, allowedTreesSentence, draftHasForcedReview, draftSaveGate, ModelDraftHost } from './model-draft-ui'
import { openModelDialog, requestReview, stageModel } from './model-stage'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  const use = (impl: (path: string, init?: { body?: unknown; params?: { path?: Record<string, string> } }) => unknown) => {
    for (const fn of Object.values(methods)) fn.mockReset().mockImplementation(impl)
  }
  const calls = () => Object.values(methods).flatMap((fn) => fn.mock.calls)
  return { methods, use, calls }
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

const draft = {
  count: 1,
  conflict: false,
  updated_at: '2026-10-27T10:00:00Z',
  lines: ['Create type recipe'],
  warnings: [],
  steps: [{ op: 'create_type', key: 'recipe' }],
  consequence: { destructive: false, lines: ['Create type recipe'] },
}

const destructive = {
  ...draft,
  lines: ['Detach attribute description'],
  steps: [{ op: 'detach_attribute', attribute: 'description' }],
  consequence: {
    destructive: true,
    confirm_name: 'Description',
    sentence: '2 values on 1 object will be deleted',
    lines: ['Detach attribute description'],
  },
}

const blocked = {
  ...draft,
  lines: [],
  steps: [{ op: 'upsert_structure' }],
  error: '4 objects are still in groups this save removes',
  consequence: { destructive: false, lines: [] },
}

const allowedTreeDefinitions = {
  types: [
    {
      id: 'type-recipe',
      key: 'recipe',
      singular: { en: 'Recipe' },
      labels: { en: 'Recipe' },
      structures: ['structure-food'],
    },
  ],
  structures: [
    { id: 'structure-food', key: 'structure-food', labels: { en: 'Food' } },
  ],
}

const allowedTrees = {
  ...draft,
  lines: ['Type recipe may use food'],
  steps: [{ op: 'set_structures', type_key: 'recipe', structures: ['structure-food'] }],
  consequence: { destructive: false, lines: ['Type recipe may use food'] },
  definitions: allowedTreeDefinitions,
}

function Host({ client: provided }: { client?: QueryClient } = {}) {
  const [fallback] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const client = provided ?? fallback
  return (
    <QueryClientProvider client={client}>
      <ModelDraftHost />
    </QueryClientProvider>
  )
}

function saves() {
  return mock.methods.post.mock.calls.filter((call) => String(call[0]).includes('/v1/model/draft/save'))
}

describe('review dialog', () => {
  beforeEach(() => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(draft)
      return Promise.resolve({})
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('saves a safe draft directly when steps arrive after the cached draft was read', async () => {
    let count = 0
    mock.use((path) => {
      if (path === '/v1/model/draft') {
        return Promise.resolve({ ...draft, count, lines: count > 0 ? draft.lines : [], consequence: { ...draft.consequence, lines: count > 0 ? draft.lines : [] } })
      }
      if (String(path).includes('/v1/model/draft/save')) {
        count = 0
        return Promise.resolve({ applied: true })
      }
      return Promise.resolve({})
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<Host client={client} />)
    await waitFor(() => expect(client.getQueryData(['model-draft'])).toBeTruthy())
    count = 1
    requestReview()
    await waitFor(() => expect(saves()).toHaveLength(1))
    expect(saves()[0]?.[1]).toEqual({ body: {} })
    expect(screen.queryByTestId('review-dialog')).toBeNull()
    await waitFor(() => expect(screen.queryByTestId('unsaved-changes')).toBeNull())
  })

  it('labels the save button Save and saves a safe change without a dialog', async () => {
    render(<Host />)
    const opener = await screen.findByTestId('review-save')
    expect(opener.textContent).toBe(copy.save)
    fireEvent.click(opener)
    await waitFor(() => expect(saves()).toHaveLength(1))
    expect(saves()[0]?.[1]).toEqual({ body: {} })
    expect(screen.queryByTestId('review-dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it('gates a non-destructive allowed-tree draft as a review', () => {
    expect(draftSaveGate(allowedTrees)).toBe('confirm')
    expect(draftHasForcedReview(allowedTrees)).toBe(true)
    expect(draftSaveGate(draft)).toBe('direct')
    expect(draftHasForcedReview(draft)).toBe(false)
    expect(draftSaveGate(destructive)).toBe('confirm')
    expect(draftHasForcedReview(destructive)).toBe(false)
  })

  it('describes an allowed-tree change with display names and a Review change title', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(allowedTrees)
      return Promise.resolve({})
    })
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))
    const dialog = await screen.findByTestId('review-dialog')
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')
    expect(title?.textContent).toBe('Review change')
    expect(description?.textContent).toBe(copy.reviewChange)
    expect(dialog.textContent?.match(/Allowed trees for Recipe: Food/g)).toHaveLength(1)
    expect(dialog.textContent).not.toContain('recipe')
    expect(dialog.textContent).not.toContain('structure-food')
    const save = screen.getByTestId('confirm-review')
    expect(save.textContent).toBe(copy.save)
    expect(save.className).toContain('btn-accent')
    expect(save.className).not.toContain('btn-danger')
    expect(saves()).toEqual([])
  })

  it('names the latest allowed-tree set per type', () => {
    expect(allowedTreesSentence(allowedTrees)).toBe('Allowed trees for Recipe: Food')
    expect(allowedTreesSentence({
      ...allowedTrees,
      steps: [
        { op: 'create_type', key: 'unrelated' },
        { op: 'set_structures', type_key: 'recipe', structures: ['structure-food'] },
        { op: 'set_structures', type_key: 'recipe', structures: [] },
      ],
    })).toBe('Allowed trees for Recipe: none')
  })

  it('removes only the steps this dialog created, never an earlier set for the same type', () => {
    const body = {
      ...allowedTrees,
      steps: [
        { op: 'set_structures', type_key: 'recipe', structures: ['structure-market'] },
        { op: 'set_structures', type_key: 'recipe', structures: ['structure-food'] },
        { op: 'set_structures', type_key: 'article', structures: ['structure-food'] },
      ],
    }
    expect(allowedTreeStepIndexes(body, [
      { index: 1, typeKey: 'recipe', structures: ['structure-food'] },
      { index: 2, typeKey: 'article', structures: ['structure-food'] },
    ])).toEqual([1, 2])
    // The recorded index no longer holds what this dialog staged.
    expect(allowedTreeStepIndexes(body, [
      { index: 1, typeKey: 'article', structures: ['structure-food'] },
    ])).toEqual([])
    // A missing type key must not widen the removal to every set_structures step.
    expect(allowedTreeStepIndexes({
      ...body,
      steps: [
        { op: 'set_structures', structures: ['structure-market'] },
        { op: 'set_structures', structures: ['structure-food'] },
      ],
    }, [
      { index: 1, typeKey: '', structures: ['structure-food'] },
    ])).toEqual([])
  })

  it('lists every pending step with display names and highlights the allowed-tree change', async () => {
    const body = {
      ...allowedTrees,
      count: 2,
      steps: [
        { op: 'update_type', key: 'recipe', plural: 'RecipesX' },
        { op: 'set_structures', type_key: 'recipe', structures: ['structure-food'] },
      ],
    }
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(body)
      return Promise.resolve({})
    })
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))
    const dialog = await screen.findByTestId('review-dialog')
    const steps = dialog.querySelectorAll('[data-testid="review-step"]')
    expect([...steps].map((step) => step.textContent)).toEqual([
      'Set the plural name of Recipe to RecipesX',
      'Allowed trees for Recipe: Food',
    ])
    expect(steps[1]?.getAttribute('data-highlight')).toBe('true')
    expect(dialog.textContent).not.toContain('recipe')
    expect(dialog.textContent).not.toContain('structure-food')
  })

  it('shows a loading state before the review dialog and disables the draft bar', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(allowedTrees)
      return Promise.resolve({})
    })
    render(<Host />)
    await screen.findByTestId('review-save')
    let release: (() => void) | undefined
    const pending = new Promise<typeof allowedTrees>((resolve) => {
      release = () => resolve(allowedTrees)
    })
    mock.methods.get.mockImplementation((path: string) =>
      path === '/v1/model/draft' ? pending : Promise.resolve({}))

    requestReview()
    const loading = await screen.findByTestId('review-loading')
    expect(loading.textContent).toContain(copy.loadingModel)
    expect(screen.queryByTestId('review-dialog')).toBeNull()
    expect((screen.getByTestId('review-save') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('discard-draft') as HTMLButtonElement).disabled).toBe(true)

    release?.()
    await screen.findByTestId('review-dialog')
    expect(screen.queryByTestId('review-loading')).toBeNull()
    expect((screen.getByTestId('review-save') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('discard-draft') as HTMLButtonElement).disabled).toBe(true)
  })

  it('cancels only the step the dialog created and keeps another draft step', async () => {
    let steps: Array<{ op: string } & Record<string, unknown>> = [
      { op: 'create_type', key: 'unrelated' },
    ]
    let current = { ...allowedTrees, count: steps.length, steps }
    mock.use((path, init) => {
      if (path === '/v1/model/draft') return Promise.resolve(current)
      if (path === '/v1/model/draft/steps') {
        const body = (init as { body?: { remove?: number } } | undefined)?.body
        if (typeof body?.remove === 'number') {
          steps = steps.filter((_, index) => index !== body.remove)
        } else {
          steps = [...steps, { op: 'set_structures', type_key: 'recipe', structures: ['structure-food'] }]
        }
        current = { ...allowedTrees, count: steps.length, steps }
        return Promise.resolve(current)
      }
      return Promise.resolve({})
    })
    render(<Host />)
    await screen.findByTestId('review-save')
    await stageModel('model.set_structures', { type_key: 'recipe', structures: ['structure-food'] })
    requestReview()
    await screen.findByTestId('review-dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(mock.methods.post).toHaveBeenCalledWith('/v1/model/draft/steps', { body: { remove: 1 } }))
    expect(mock.methods.delete).not.toHaveBeenCalled()
    expect(saves()).toEqual([])
    await waitFor(() => expect(screen.queryByTestId('review-dialog')).toBeNull())
    await waitFor(() => expect(screen.getByTestId('unsaved-changes').textContent?.startsWith('1 ')).toBe(true))
    expect(steps).toEqual([{ op: 'create_type', key: 'unrelated' }])
  })

  it('removes the staged step when Cancel lands before the draft cache has it', async () => {
    let gets = 0
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    mock.use((path, init) => {
      if (path === '/v1/model/draft') {
        gets += 1
        if (gets === 1) return Promise.resolve({ count: 0, conflict: false, steps: [] })
        return pending.then(() => allowedTrees)
      }
      if (path === '/v1/model/draft/steps') {
        const body = (init as { body?: { remove?: number } } | undefined)?.body
        if (typeof body?.remove === 'number') return Promise.resolve({ count: 0, conflict: false, steps: [] })
        return Promise.resolve(allowedTrees)
      }
      return Promise.resolve({})
    })
    render(<Host />)
    await waitFor(() => expect(mock.methods.get).toHaveBeenCalledWith('/v1/model/draft'))
    await stageModel('model.set_structures', { type_key: 'recipe', structures: ['structure-food'] })
    requestReview()
    const loading = await screen.findByTestId('review-loading')
    fireEvent.click(within(loading).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(mock.methods.post).toHaveBeenCalledWith('/v1/model/draft/steps', { body: { remove: 0 } }))
    release?.()
    await waitFor(() => expect(screen.queryByTestId('review-loading')).toBeNull())
    expect(saves()).toEqual([])
  })

  it('Escape while the set_structures POST is in flight removes the late step and leaves no count', async () => {
    let steps: Array<{ op: string } & Record<string, unknown>> = []
    let release: (() => void) | undefined
    const pendingPost = new Promise<void>((resolve) => {
      release = resolve
    })
    mock.use((path, init) => {
      if (path === '/v1/model/draft') return Promise.resolve({ ...allowedTrees, count: steps.length, steps: [...steps] })
      if (path === '/v1/model/draft/steps') {
        const body = (init as { body?: { remove?: number } } | undefined)?.body
        if (typeof body?.remove === 'number') {
          steps = steps.filter((_, index) => index !== body.remove)
          return Promise.resolve({ ...allowedTrees, count: steps.length, steps: [...steps] })
        }
        return pendingPost.then(() => {
          steps = [{ op: 'set_structures', type_key: 'recipe', structures: ['structure-food'] }]
          return { ...allowedTrees, count: steps.length, steps: [...steps] }
        })
      }
      return Promise.resolve({})
    })
    render(<Host />)
    await waitFor(() => expect(mock.methods.get).toHaveBeenCalledWith('/v1/model/draft'))
    const staged = stageModel('model.set_structures', { type_key: 'recipe', structures: ['structure-food'] })
    staged.catch(() => undefined)
    const loading = await screen.findByTestId('review-loading')
    fireEvent.keyDown(loading, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('review-loading')).toBeNull())

    release?.()
    await waitFor(() => expect(mock.methods.post).toHaveBeenCalledWith('/v1/model/draft/steps', { body: { remove: 0 } }))
    await waitFor(() => expect(screen.queryByTestId('unsaved-changes')).toBeNull())
    expect(screen.queryByTestId('review-dialog')).toBeNull()
    expect(screen.queryByTestId('review-loading')).toBeNull()
    expect(steps).toEqual([])
  })

  it('Escape removes only the step the dialog created', async () => {
    let steps: Array<{ op: string } & Record<string, unknown>> = []
    let current = { ...allowedTrees, count: 0, steps }
    mock.use((path, init) => {
      if (path === '/v1/model/draft') return Promise.resolve(current)
      if (path === '/v1/model/draft/steps') {
        const body = (init as { body?: { remove?: number } } | undefined)?.body
        if (typeof body?.remove === 'number') {
          steps = steps.filter((_, index) => index !== body.remove)
        } else {
          steps = [...steps, { op: 'set_structures', type_key: 'recipe', structures: ['structure-food'] }]
        }
        current = { ...allowedTrees, count: steps.length, steps }
        return Promise.resolve(current)
      }
      return Promise.resolve({})
    })
    render(<Host />)
    await stageModel('model.set_structures', { type_key: 'recipe', structures: ['structure-food'] })
    requestReview()
    const dialog = await screen.findByTestId('review-dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(mock.methods.post).toHaveBeenCalledWith('/v1/model/draft/steps', { body: { remove: 0 } }))
    expect(mock.methods.delete).not.toHaveBeenCalled()
    expect(saves()).toEqual([])
    await waitFor(() => expect(screen.queryByTestId('review-dialog')).toBeNull())
    expect(steps).toEqual([])
  })

  it('keeps an earlier set_structures step for the same type when the dialog is cancelled', async () => {
    let steps: Array<{ op: string } & Record<string, unknown>> = [
      { op: 'set_structures', type_key: 'recipe', structures: ['structure-market'] },
    ]
    let current = { ...allowedTrees, count: steps.length, steps }
    mock.use((path, init) => {
      if (path === '/v1/model/draft') return Promise.resolve(current)
      if (path === '/v1/model/draft/steps') {
        const body = (init as { body?: { remove?: number } } | undefined)?.body
        if (typeof body?.remove === 'number') {
          steps = steps.filter((_, index) => index !== body.remove)
        } else {
          steps = [...steps, { op: 'set_structures', type_key: 'recipe', structures: ['structure-food'] }]
        }
        current = { ...allowedTrees, count: steps.length, steps }
        return Promise.resolve(current)
      }
      return Promise.resolve({})
    })
    render(<Host />)
    await screen.findByTestId('review-save')
    await stageModel('model.set_structures', { type_key: 'recipe', structures: ['structure-food'] })
    requestReview()
    await screen.findByTestId('review-dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(mock.methods.post).toHaveBeenCalledWith('/v1/model/draft/steps', { body: { remove: 1 } }))
    await waitFor(() => expect(steps).toEqual([
      { op: 'set_structures', type_key: 'recipe', structures: ['structure-market'] },
    ]))
    expect(mock.methods.post.mock.calls.filter((call) => String(call[0]).includes('/v1/model/draft/steps') && (call[1] as { body?: { remove?: number } })?.body?.remove === 0)).toEqual([])
  })

  it('drops the unsaved count before the remove request settles and restores it on failure', async () => {
    let steps: Array<{ op: string } & Record<string, unknown>> = [
      { op: 'create_type', key: 'unrelated' },
    ]
    let current = { ...allowedTrees, count: steps.length, steps }
    let rejectRemove: ((reason: unknown) => void) | undefined
    mock.use((path, init) => {
      if (path === '/v1/model/draft') return Promise.resolve(current)
      if (path === '/v1/model/draft/steps') {
        const body = (init as { body?: { remove?: number } } | undefined)?.body
        if (typeof body?.remove === 'number') {
          return new Promise((_, reject) => {
            rejectRemove = reject
          })
        }
        steps = [...steps, { op: 'set_structures', type_key: 'recipe', structures: ['structure-food'] }]
        current = { ...allowedTrees, count: steps.length, steps }
        return Promise.resolve(current)
      }
      return Promise.resolve({})
    })
    render(<Host />)
    await screen.findByTestId('review-save')
    await stageModel('model.set_structures', { type_key: 'recipe', structures: ['structure-food'] })
    requestReview()
    await screen.findByTestId('review-dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('unsaved-changes').textContent?.startsWith('1 ')).toBe(true)
    rejectRemove?.(new ApiError(422, 'Unprocessable Entity', { detail: 'the step could not be removed' }))
    await waitFor(() => expect(screen.getByTestId('unsaved-changes').textContent?.startsWith('2 ')).toBe(true))
    expect(await screen.findByText('the step could not be removed')).toBeTruthy()
  })

  it('saves a forced allowed-tree review once and closes the dialog', async () => {
    let count = 1
    mock.use((path) => {
      if (path === '/v1/model/draft') {
        return Promise.resolve(count > 0 ? allowedTrees : { count: 0, conflict: false, steps: [] })
      }
      if (String(path).includes('/v1/model/draft/save')) {
        count = 0
        return Promise.resolve({ applied: true })
      }
      return Promise.resolve({})
    })
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))
    fireEvent.click(await screen.findByTestId('confirm-review'))
    await waitFor(() => expect(saves()).toHaveLength(1))
    expect(saves()[0]?.[1]).toEqual({ body: {} })
    await waitFor(() => expect(screen.queryByTestId('review-dialog')).toBeNull())
    await waitFor(() => expect(screen.queryByTestId('unsaved-changes')).toBeNull())
  })

  it('leaves a destructive draft staged when its review is cancelled', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(destructive)
      return Promise.resolve({})
    })
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))
    await screen.findByTestId('review-dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByTestId('review-dialog')).toBeNull())
    expect(saves()).toEqual([])
    expect(mock.methods.delete).not.toHaveBeenCalled()
  })

  it('asks before a destructive save and does not save on Escape', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(destructive)
      return Promise.resolve({})
    })
    render(<Host />)
    const opener = await screen.findByTestId('review-save')
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByTestId('review-dialog')
    expect(dialog.querySelector('input')).toBeNull()
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')
    expect(title?.textContent).toBe(copy.reviewChangeTitle)
    expect(description?.textContent).toBe('2 values on 1 object will be deleted')
    const remove = screen.getByTestId('confirm-review')
    expect(remove.textContent).toBe(copy.delete)
    expect(remove.className).toContain('btn-danger')
    expect(saves()).toEqual([])
    screen.getByRole('button', { name: 'Cancel' }).focus()
    expect(document.activeElement).not.toBe(opener)

    const underneath = vi.fn()
    window.addEventListener('keydown', underneath)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    window.removeEventListener('keydown', underneath)

    await waitFor(() => expect(screen.queryByTestId('review-dialog')).toBeNull())
    expect(underneath).not.toHaveBeenCalled()
    expect(saves()).toEqual([])
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('sends the server confirm name only after the danger action', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(destructive)
      return Promise.resolve({})
    })
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))
    fireEvent.click(await screen.findByTestId('confirm-review'))
    await waitFor(() => expect(saves()).toHaveLength(1))
    expect(saves()[0]?.[1]).toEqual({ body: { confirm_name: 'Description' } })
  })

  it('keeps a blocked change blocked without posting a save', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(blocked)
      return Promise.resolve({})
    })
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))
    const dialog = await screen.findByTestId('review-dialog')
    expect(dialog.textContent).toContain('4 objects are still in groups this save removes')
    expect(screen.queryByTestId('confirm-review')).toBeNull()
    expect(dialog.querySelector('input')).toBeNull()
    expect(saves()).toEqual([])
  })

  it('shows a server rejection and does not clear the draft', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(draft)
      if (String(path).includes('/v1/model/draft/save')) {
        return Promise.reject(new ApiError(422, 'Unprocessable Entity', { detail: '4 objects are still in groups this save removes', code: 'group_occupied' }))
      }
      return Promise.resolve({})
    })
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))
    expect(await screen.findByText('4 objects are still in groups this save removes')).toBeTruthy()
    expect(screen.queryByTestId('review-dialog')).toBeNull()
    expect(screen.getByTestId('unsaved-changes')).toBeTruthy()
    expect(saves()).toHaveLength(1)
  })

  it('does not post a second save while the first is in flight', async () => {
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(draft)
      if (String(path).includes('/v1/model/draft/save')) return pending.then(() => ({ applied: true }))
      return Promise.resolve({})
    })
    render(<Host />)
    const opener = await screen.findByTestId('review-save')
    fireEvent.click(opener)
    fireEvent.click(opener)
    await waitFor(() => expect(saves()).toHaveLength(1))
    release?.()
    await waitFor(() => expect(saves()).toHaveLength(1))
  })

  it('keeps the destructive dialog open when the server rejects the confirm', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(destructive)
      if (String(path).includes('/v1/model/draft/save')) {
        return Promise.reject(new ApiError(422, 'Unprocessable Entity', { detail: 'the definition set does not compile', code: 'invalid_definitions' }))
      }
      return Promise.resolve({})
    })
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))
    fireEvent.click(await screen.findByTestId('confirm-review'))
    expect(await screen.findByText('the definition set does not compile')).toBeTruthy()
    expect(screen.getByTestId('review-dialog')).toBeTruthy()
    expect(screen.getByTestId('unsaved-changes')).toBeTruthy()
  })

  it('keeps the create dialog and the typed name when the write fails', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(draft)
      if (String(path).includes('/v1/model/draft/steps')) {
        return Promise.reject(new ApiError(422, 'Unprocessable Entity', { detail: 'the write failed validation' }))
      }
      return Promise.resolve({})
    })
    render(<Host />)
    openModelDialog('type')
    const input = await screen.findByTestId('model-dialog-name')
    fireEvent.change(input, { target: { value: 'Recipe' } })
    fireEvent.click(screen.getByTestId('model-dialog-save'))
    expect(await screen.findByText('the write failed validation')).toBeTruthy()
    expect(screen.getByTestId('model-dialog')).toBeTruthy()
    expect((screen.getByTestId('model-dialog-name') as HTMLInputElement).value).toBe('Recipe')
  })

  it('labels the create dialog through the shared dialog after a direct save', async () => {
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))
    await waitFor(() => expect(saves()).toHaveLength(1))
    expect(screen.queryByTestId('review-dialog')).toBeNull()

    openModelDialog('type')
    const create = await screen.findByTestId('model-dialog')
    const createTitle = document.getElementById(create.getAttribute('aria-labelledby') ?? '')
    expect(createTitle?.textContent).toBe(copy.newType)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })
})
