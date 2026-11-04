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
  consequence: { destructive: false, lines: ['Create type recipe'] },
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

  it('opens review when steps are staged after the cached draft was read', async () => {
    let count = 0
    mock.use((path) => {
      if (path === '/v1/model/draft') {
        return Promise.resolve({ ...draft, count, lines: count > 0 ? draft.lines : [], consequence: { ...draft.consequence, lines: count > 0 ? draft.lines : [] } })
      }
      return Promise.resolve({})
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<Host client={client} />)
    await waitFor(() => expect(client.getQueryData(['model-draft'])).toBeTruthy())
    count = 1
    requestReview()
    const dialog = await screen.findByTestId('review-dialog')
    expect(dialog).toBeTruthy()
    expect(await screen.findByText('Create type recipe')).toBeTruthy()
  })

  it('closes on Escape without saving and returns focus', async () => {
    render(<Host />)
    const opener = await screen.findByTestId('review-save')
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog')
    expect(screen.getByTestId('review-dialog')).toBeTruthy()
    screen.getByRole('button', { name: 'Cancel' }).focus()
    expect(document.activeElement).not.toBe(opener)

    const underneath = vi.fn()
    window.addEventListener('keydown', underneath)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    window.removeEventListener('keydown', underneath)

    await waitFor(() => expect(screen.queryByTestId('review-dialog')).toBeNull())
    expect(underneath).not.toHaveBeenCalled()
    const saves = mock.calls().filter((call) => String(call[0]).includes('/v1/model/draft/save'))
    expect(saves).toEqual([])
    await waitFor(() => expect(document.activeElement).toBe(opener))
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

  it('labels the review and create dialogs through the shared dialog', async () => {
    render(<Host />)
    fireEvent.click(await screen.findByTestId('review-save'))

    const review = await screen.findByRole('dialog')
    const reviewTitle = document.getElementById(review.getAttribute('aria-labelledby') ?? '')
    const reviewDescription = document.getElementById(review.getAttribute('aria-describedby') ?? '')
    expect(reviewTitle?.textContent).toBe(copy.reviewAndSave)
    expect(reviewDescription?.textContent).toBe(copy.reviewChange)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByTestId('review-dialog')).toBeNull())

    openModelDialog('type')
    const create = await screen.findByTestId('model-dialog')
    const createTitle = document.getElementById(create.getAttribute('aria-labelledby') ?? '')
    expect(createTitle?.textContent).toBe(copy.newType)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })
})
