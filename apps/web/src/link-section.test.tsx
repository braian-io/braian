// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { copy } from './i18n'
import { LinkSections } from './link-section'

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
  version?: number
}

function link(overrides: Partial<TestLink> = {}): TestLink {
  return {
    id: 'link-1',
    peer_id: 'peer-1',
    peer_key: 'ART-2',
    peer_name: 'Mature cheddar',
    peer_type: 'article',
    has_values: false,
    version: 2,
    ...overrides,
  }
}

function renderLinks(item: TestLink, provided?: QueryClient) {
  const client = provided ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

beforeEach(() => {
  vi.clearAllMocks()
  del.mockResolvedValue({} as never)
})

afterEach(() => {
  cleanup()
})

describe('LinkSections removal', () => {
  it('removes a link without values without a success toast', async () => {
    renderLinks(link({ sort_order: '3' }))
    await removeFocusedLink()
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/v1/links/{id}', { params: { path: { id: 'link-1' } } })
    })
  })

  it('confirms a link with values using a plain danger confirm and no text input', async () => {
    renderLinks(link({ has_values: true }))
    await removeFocusedLink()
    const dialog = await screen.findByTestId('link-confirm')
    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')
    expect(description?.textContent).toBe('Remove the link to Mature cheddar? Its link values are deleted too.')
    expect(screen.queryByTestId('link-confirm-input')).toBeNull()
    expect(dialog.querySelector('input')).toBeNull()
    const confirm = screen.getByTestId('link-confirm-remove') as HTMLButtonElement
    expect(confirm.className).toContain('btn-danger')
    fireEvent.click(confirm)
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/v1/links/{id}', { params: { path: { id: 'link-1' } } })
    })
    await waitFor(() => expect(screen.queryByTestId('link-confirm')).toBeNull())
    expect(copy.confirmRemoveLink).toBe('Remove the link to {peer}? Its link values are deleted too.')
  })

  it('describes the confirm dialog and closes it on Escape with focus restored', async () => {
    renderLinks(link({ has_values: true }))
    const row = screen.getByTestId('link-row')
    act(() => row.focus())
    await act(async () => {
      window.dispatchEvent(new Event('braian-remove-link'))
    })
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('link-confirm')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(row))
  })

  it('refreshes both endpoints, peer lists, history and trash on remove', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    renderLinks(link({ sort_order: '3' }), client)
    await removeFocusedLink()
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['object', 'object-1'] }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trash'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['history', 'object-1'] })
  })

  it('opens edit link attributes from the row action', async () => {
    renderLinks(link())
    fireEvent.click(screen.getByTestId('link-edit-attributes'))
    expect(await screen.findByTestId('link-edit-dialog')).toBeTruthy()
  })
})