// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { copy } from './i18n'
import { LinkSections } from './link-section'

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }),
}))

vi.mock('sonner', () => ({ toast: mocks.toast }))

const defs = {
  types: [
    {
      id: 'link-type-1',
      key: 'related',
      kind: 'link',
      link: {
        from_types: ['article'],
        to_types: ['article'],
        from_label: { labels: { en: 'Related by' } },
        to_label: { labels: { en: 'Related' } },
      },
    },
  ],
}

type TestLink = {
  id: string
  peer_id: string
  peer_key: string
  peer_name?: string
  peer_type: string
  has_values: boolean
  sort_order?: string | number | null
}

function link(overrides: Partial<TestLink> = {}): TestLink {
  return {
    id: 'link-1',
    peer_id: 'peer-1',
    peer_key: 'ART-2',
    peer_name: 'Mature cheddar',
    peer_type: 'article',
    has_values: false,
    ...overrides,
  }
}

function renderLinks(item: TestLink) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LinkSections
        objectId="object-1"
        typeKey="article"
        defs={defs}
        links={[
          {
            link_type: 'related',
            label: 'Related',
            direction: 'out',
            links: [item],
          },
        ]}
        onOpen={() => undefined}
      />
    </QueryClientProvider>,
  )
}

async function removeFocusedLink() {
  fireEvent.focus(screen.getByTestId('link-row'))
  await act(async () => {
    window.dispatchEvent(new Event('braian-remove-link'))
  })
}

const del = vi.spyOn(api, 'delete')
const post = vi.spyOn(api, 'post')

beforeEach(() => {
  vi.clearAllMocks()
  del.mockResolvedValue({} as never)
  post.mockResolvedValue({} as never)
})

afterEach(() => {
  cleanup()
})

describe('LinkSections picker', () => {
  it('closes on Escape and returns focus to the add-link trigger', async () => {
    renderLinks(link())
    const trigger = screen.getAllByTestId('add-link')[0]!
    trigger.focus()
    fireEvent.click(trigger)

    const picker = await screen.findByTestId('link-picker')
    expect(picker.getAttribute('role')).toBe('dialog')

    fireEvent.keyDown(picker, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('link-picker')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})

describe('LinkSections removal', () => {
  it('toasts Undo after removing a link without values and recreates it with its sort order', async () => {
    renderLinks(link({ sort_order: '3' }))

    await removeFocusedLink()

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/v1/links/{id}', { params: { path: { id: 'link-1' } } })
    })
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1))
    const [message, options] = mocks.toast.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ]
    expect(message).toBe('Link removed')
    expect(options.action.label).toBe('Undo')

    await act(async () => {
      options.action.onClick()
    })

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/v1/links', {
      body: {
        type: 'related',
        from_id: 'object-1',
        to_id: 'peer-1',
        values: { sort_order: { value: '3' } },
      },
    })
  })

  it('confirms with the peer display name and enables removal only when it matches', async () => {
    renderLinks(link({ has_values: true }))

    await removeFocusedLink()

    await screen.findByText('Type Mature cheddar to confirm')
    const input = screen.getByTestId('link-confirm-input')
    expect(input.getAttribute('aria-label')).toBe('Type Mature cheddar to confirm')
    const confirm = screen.getByTestId('link-confirm-remove') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect(screen.queryByTestId('link-confirm-match')).toBeNull()

    fireEvent.change(input, { target: { value: 'Mature' } })
    expect(screen.queryByTestId('link-confirm-match')).toBeNull()
    expect(confirm.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'Mature cheddar' } })
    expect(screen.getByTestId('link-confirm-match').textContent).toContain('matches')
    expect(confirm.disabled).toBe(false)

    fireEvent.click(confirm)
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/v1/links/{id}', { params: { path: { id: 'link-1' } } })
    })
    expect(copy.confirmRemoveLink).toBe('Type {peer} to confirm')
  })
})
