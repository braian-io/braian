// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { copy } from './i18n'
import { ModelDraftHost } from './model-draft-ui'
import { openModelDialog, requestReview } from './model-stage'

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

  it('asks before a destructive save and does not save on Escape', async () => {
    mock.use((path) => {
      if (path === '/v1/model/draft') return Promise.resolve(destructive)
      return Promise.resolve({})
    })
    render(<Host />)
    const opener = await screen.findByTestId('review-save')
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog')
    expect(screen.getByTestId('review-dialog')).toBeTruthy()
    expect(dialog.querySelector('input')).toBeNull()
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')
    expect(title?.textContent).toBe(copy.save)
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
