// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import { copy } from './i18n'
import { ProposalBulkActions, closedProposalReason } from './proposal-actions'
import { ProposalView, type PanesSession } from './panes'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  const use = (impl: (path: string) => unknown) => {
    for (const fn of Object.values(methods)) fn.mockReset().mockImplementation(impl)
  }
  return { methods, use }
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

let proposal: Json

function Host() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const session = useMemo<PanesSession>(
    () => ({
      group: null,
      objectId: null,
      proposalId: 'p1',
      language: 'en',
      setGroup: () => undefined,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [],
  )
  return (
    <QueryClientProvider client={client}>
      <ProposalView session={session} />
    </QueryClientProvider>
  )
}

function row(id: string, status: string) {
  return {
    id,
    object_id: `obj-${id}`,
    type_key: 'item',
    status,
    patch: { values: { name: { en: 'New' } } },
  }
}

function disabled(testId: string) {
  return (screen.getByTestId(testId) as HTMLButtonElement).disabled
}

function opacity(testId: string) {
  const value = getComputedStyle(screen.getByTestId(testId)).opacity
  return Number(value || 1)
}

function paint(testId: string) {
  const style = getComputedStyle(screen.getByTestId(testId))
  return {
    background: style.backgroundColor,
    border: style.borderColor,
    color: style.color,
    opacity: Number(style.opacity || 1),
  }
}

function stylesPath() {
  const candidates = [join(process.cwd(), 'src/styles.css'), join(process.cwd(), 'apps/web/src/styles.css')]
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new Error(`styles.css not found from ${process.cwd()}`)
  return found
}

function cssText() {
  return readFileSync(stylesPath(), 'utf8')
}

function ruleBlock(css: string, selector: string) {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`rule missing: ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

function declaration(block: string, property: string) {
  const match = block.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`))
  if (!match) throw new Error(`declaration missing: ${property}`)
  return match[1]!.trim()
}

function variableBlock(css: string, selector: string) {
  const block = ruleBlock(css, selector)
  return new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]))
}

function resolveToken(value: string, variables: Map<string, string>) {
  const match = value.match(/^var\(--([\w-]+)\)$/)
  if (!match) return value
  const found = variables.get(match[1]!)
  if (!found) throw new Error(`variable missing: ${match[1]}`)
  return found
}

function luminance(hex: string) {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

function contrast(foreground: string, background: string) {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Load the real disabled-action and reason rules. jsdom does not read the Vite bundle. */
function installActionButtonStyles() {
  const css = cssText()
  const start = css.indexOf('/* Disabled action buttons (row 212) */')
  const end = css.indexOf('/* End disabled action buttons (row 212) */')
  if (start < 0 || end < start) throw new Error('disabled action button styles missing')
  const style = document.createElement('style')
  style.id = 'proposal-action-disabled-styles'
  style.textContent = [
    css.slice(start, end),
    `.proposal-actions { ${ruleBlock(css, '.proposal-actions')} }`,
    `.proposal-actions-reason { ${ruleBlock(css, '.proposal-actions-reason')} }`,
  ].join('\n')
  document.head.appendChild(style)
}

async function expectClosedActions(reason: string) {
  expect(disabled('save-all')).toBe(true)
  expect(disabled('discard-all')).toBe(true)
  expect(opacity('save-all')).toBe(0.8)
  expect(opacity('discard-all')).toBe(0.8)
  await waitFor(() =>
    expect(paint('discard-all'), 'Discard all must look exactly like disabled Save all').toEqual(paint('save-all')),
  )
  const explanation = screen.getByTestId('proposal-actions-reason')
  expect(explanation.textContent).toBe(reason)
  expect(explanation.getAttribute('title')).toBe(reason)
  expect(screen.getByTestId('save-all').getAttribute('aria-describedby')).toBe(explanation.id)
  expect(screen.getByTestId('discard-all').getAttribute('aria-describedby')).toBe(explanation.id)
  const wrapper = screen.getByTestId('proposal-actions')
  expect(wrapper.getAttribute('title'), 'the tooltip lives on the wrapper, not the disabled button').toBe(reason)
  expect(getComputedStyle(wrapper).display).toBe('inline-flex')
}

beforeEach(() => {
  installActionButtonStyles()
  mock.use((path: string) => {
    if (path === '/v1/proposals') return Promise.resolve({ proposals: [proposal] })
    if (path === '/v1/proposals/{id}') return Promise.resolve(proposal)
    if (path === '/v1/definitions') return Promise.resolve({ languages: ['en'], types: [], attributes: [], structures: [] })
    return Promise.resolve({})
  })
})

afterEach(() => {
  cleanup()
  document.getElementById('proposal-action-disabled-styles')?.remove()
})

describe('closed proposal bulk actions', () => {
  it('disables and explains Save all and Discard all on an accepted proposal', async () => {
    proposal = { id: 'p1', title: 'Accepted', status: 'accepted', rows: [row('r1', 'accepted')] }
    render(<Host />)
    await screen.findByTestId('save-all')
    await waitFor(() => expect(disabled('discard-all')).toBe(true))
    await expectClosedActions(copy.proposalAlreadyAccepted)
  })

  it('disables and explains Save all and Discard all on a discarded proposal', async () => {
    proposal = { id: 'p1', title: 'Discarded', status: 'discarded', rows: [row('r1', 'rejected')] }
    render(<Host />)
    await screen.findByTestId('save-all')
    await waitFor(() => expect(disabled('discard-all')).toBe(true))
    await expectClosedActions(copy.proposalAlreadyDiscarded)
  })

  it('disables and explains both actions on a closed proposal with accepted and rejected rows', async () => {
    proposal = {
      id: 'p1',
      title: 'Mixed',
      status: 'accepted',
      rows: [row('r1', 'accepted'), row('r2', 'rejected')],
    }
    render(<Host />)
    await screen.findByTestId('save-all')
    await waitFor(() => expect(disabled('discard-all')).toBe(true))
    await expectClosedActions(copy.proposalAlreadyClosed)
  })

  it('never calls a closed state before the proposal is known', async () => {
    let release!: (value: Json) => void
    const pendingProposal = new Promise<Json>((resolve) => {
      release = resolve
    })
    mock.use((path: string) => {
      if (path === '/v1/proposals') return Promise.resolve({ proposals: [{ id: 'p1', title: 'Discarded', status: 'discarded' }] })
      if (path === '/v1/proposals/{id}') return pendingProposal
      if (path === '/v1/definitions') return Promise.resolve({ languages: ['en'], types: [], attributes: [], structures: [] })
      return Promise.resolve({})
    })
    proposal = { id: 'p1', title: 'Discarded', status: 'discarded', rows: [row('r1', 'rejected')] }
    render(<Host />)
    const loading = await screen.findByTestId('proposal-actions-loading')
    expect(loading.textContent).toBe(copy.loadingProposal)
    expect(disabled('save-all')).toBe(true)
    expect(disabled('discard-all')).toBe(true)
    expect(screen.queryByTestId('proposal-actions-reason')).toBeNull()
    expect(screen.getByTestId('proposal-actions').getAttribute('title')).toBeNull()
    expect(screen.queryByText(copy.proposalAlreadyClosed)).toBeNull()
    expect(screen.queryByText(copy.proposalAlreadyDiscarded)).toBeNull()
    release(proposal)
    await waitFor(() => expect(screen.getByTestId('proposal-actions-reason').textContent).toBe(copy.proposalAlreadyDiscarded))
    expect(screen.queryByText(copy.proposalAlreadyClosed)).toBeNull()
    expect(screen.queryByTestId('proposal-actions-loading')).toBeNull()
  })

  it('keeps Save all and Discard all enabled with no closed explanation while a row is pending', async () => {
    proposal = { id: 'p1', title: 'Open', status: 'open', rows: [row('r1', 'pending')] }
    render(<Host />)
    await screen.findByTestId('save-all')
    await waitFor(() => expect(disabled('save-all')).toBe(false))
    expect(disabled('discard-all')).toBe(false)
    expect(opacity('save-all')).toBe(1)
    expect(opacity('discard-all')).toBe(1)
    expect(screen.queryByTestId('proposal-actions-reason')).toBeNull()
    expect(screen.getByTestId('proposal-actions').getAttribute('title')).toBeNull()
    expect(screen.getByTestId('save-all').getAttribute('aria-describedby')).toBeNull()
    expect(screen.getByTestId('discard-all').getAttribute('aria-describedby')).toBeNull()
    expect(screen.getByTestId('discard-all').className, 'an enabled Discard all stays danger-coloured').toContain('btn-danger')
    expect(screen.getByTestId('discard-all').className).not.toContain('btn-raised')
    expect(screen.getByTestId('save-all').className, 'Save all is the primary CTA while a row is pending').toContain('btn-accent')
    expect(screen.getByTestId('save-all').className).not.toContain('btn-raised')
  })

  it('makes Save all primary and Discard all secondary danger in the Ctrl+K preview', () => {
    render(
      <ProposalBulkActions
        status="open"
        rows={[row('r1', 'pending')]}
        saveDisabled={false}
        discardDisabled={false}
        saveVariant="primary"
        saveTestId="palette-save-all"
        discardTestId="palette-discard-all"
        onSave={() => undefined}
        onDiscard={() => undefined}
      />,
    )
    expect(screen.getByTestId('palette-save-all').className, 'palette Save all uses the same primary rule').toContain('btn-accent')
    expect(screen.getByTestId('palette-save-all').className).not.toContain('btn-raised')
    expect(screen.getByTestId('palette-discard-all').className, 'palette Discard all stays secondary danger').toContain('btn-danger')
    expect(disabled('palette-save-all')).toBe(false)
    expect(disabled('palette-discard-all')).toBe(false)
    expect(opacity('palette-save-all')).toBe(1)
    expect(opacity('palette-discard-all')).toBe(1)
  })

  it('confirms before discarding and shows the proposal name without consequence lines', async () => {
    proposal = { id: 'p1', title: 'Agent draft', status: 'open', rows: [row('r1', 'pending')] }
    render(<Host />)
    await screen.findByTestId('discard-all')
    await waitFor(() => expect(disabled('discard-all')).toBe(false))
    mock.methods.post.mockClear()

    fireEvent.click(screen.getByTestId('discard-all'))
    const dialog = await screen.findByTestId('discard-all-confirm')
    expect(within(dialog).getByTestId('discard-all-proposal').textContent).toBe('Agent draft')
    expect(within(dialog).getByTestId('discard-all-consequence').textContent).toBe(copy.discardProposalFallback)
    expect(mock.methods.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('cancel-discard-all'))
    await waitFor(() => expect(screen.queryByTestId('discard-all-confirm')).toBeNull())
    expect(mock.methods.post).not.toHaveBeenCalled()
    expect(screen.getByTestId('proposal-actions')).toBeTruthy()

    fireEvent.click(screen.getByTestId('discard-all'))
    await screen.findByTestId('discard-all-confirm')
    fireEvent.click(screen.getByTestId('confirm-discard-all'))
    await waitFor(() =>
      expect(mock.methods.post).toHaveBeenCalledWith('/v1/proposals/{id}/discard', {
        params: { path: { id: 'p1' } },
      }),
    )
    await waitFor(() => expect(screen.queryByTestId('discard-all-confirm')).toBeNull())
  })

  it('shows the consequence lines in the discard confirmation when the proposal has them', async () => {
    proposal = {
      id: 'p1',
      title: 'Agent draft',
      status: 'open',
      rows: [row('r1', 'pending')],
      consequence: { lines: ['Updates 1 product', 'Drops the old name'] },
    }
    render(<Host />)
    await screen.findByTestId('discard-all')
    await waitFor(() => expect(disabled('discard-all')).toBe(false))
    fireEvent.click(screen.getByTestId('discard-all'))
    const dialog = await screen.findByTestId('discard-all-confirm')
    expect(within(dialog).getByTestId('discard-all-proposal').textContent).toBe('Agent draft')
    expect(within(dialog).getByTestId('discard-all-consequence').textContent).toContain('Updates 1 product')
    expect(within(dialog).getByTestId('discard-all-consequence').textContent).toContain('Drops the old name')
  })

  it('only reports a genuinely mixed proposal as already closed', () => {
    expect(closedProposalReason(undefined, [])).toBeNull()
    expect(closedProposalReason('open', [])).toBeNull()
    expect(closedProposalReason('open', [row('r1', 'rejected')])).toBe(copy.proposalAlreadyDiscarded)
    expect(closedProposalReason('accepted', [])).toBe(copy.proposalAlreadyAccepted)
    expect(closedProposalReason('accepted', [row('r1', 'accepted'), row('r2', 'rejected')])).toBe(copy.proposalAlreadyClosed)
  })

  it('makes disabled Discard all neutral and the reason readable in both themes', () => {
    const css = cssText()
    const raised = ruleBlock(css, 'button.btn-raised:disabled,\nbutton.btn-raised[aria-disabled=\'true\']')
    const danger = ruleBlock(css, 'button.btn-danger:disabled,')
    for (const property of ['background', 'color', 'border-color', 'opacity']) {
      expect(declaration(danger, property), `disabled Discard all ${property} must match disabled Save all`).toBe(
        declaration(raised, property),
      )
    }
    for (const [name, block] of [
      ['Save all', raised],
      ['Discard all', danger],
    ] as const) {
      expect(declaration(block, 'transition'), `disabled ${name} must not animate through another colour`).toBe('none')
    }
    const reason = ruleBlock(css, '.proposal-actions-reason')
    expect(parseFloat(resolveToken(declaration(reason, 'font-size'), variableBlock(css, ':root')))).toBeGreaterThanOrEqual(13)
    for (const [theme, selector] of [
      ['dark', ':root'],
      ['light', ":root[data-theme='light']"],
    ] as const) {
      const variables = variableBlock(css, selector)
      const foreground = resolveToken(declaration(reason, 'color'), variables)
      const background = variables.get('panel')!
      expect(contrast(foreground, background), `${theme} reason contrast`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('uses the same disabled look and explanation in the Ctrl+K proposal preview', async () => {
    render(
      <ProposalBulkActions
        rows={[row('r1', 'accepted'), row('r2', 'rejected')]}
        saveDisabled
        discardDisabled
        discardFirst
        saveTestId="palette-save-all"
        discardTestId="palette-discard-all"
        reasonTestId="palette-proposal-reason"
        onSave={() => undefined}
        onDiscard={() => undefined}
      />,
    )
    expect(opacity('palette-save-all')).toBe(0.8)
    expect(opacity('palette-discard-all')).toBe(0.8)
    await waitFor(() => expect(paint('palette-discard-all')).toEqual(paint('palette-save-all')))
    const explanation = screen.getByTestId('palette-proposal-reason')
    expect(explanation.textContent).toBe(copy.proposalAlreadyClosed)
    expect(screen.getByTestId('palette-save-all').getAttribute('aria-describedby')).toBe(explanation.id)
    expect(screen.getByTestId('palette-discard-all').getAttribute('aria-describedby')).toBe(explanation.id)
    expect(screen.getByTestId('proposal-actions').getAttribute('title')).toBe(copy.proposalAlreadyClosed)
  })

  it('shows a loading state in the Ctrl+K preview when the status is unknown', () => {
    render(
      <ProposalBulkActions
        rows={[]}
        loading
        saveDisabled
        discardDisabled
        discardFirst
        saveVariant="primary"
        saveTestId="palette-save-all"
        discardTestId="palette-discard-all"
        reasonTestId="palette-proposal-reason"
        loadingTestId="palette-proposal-loading"
        onSave={() => undefined}
        onDiscard={() => undefined}
      />,
    )
    expect(screen.getByTestId('palette-proposal-loading').textContent).toBe(copy.loadingProposal)
    expect(screen.queryByTestId('palette-proposal-reason')).toBeNull()
    expect(screen.getByTestId('proposal-actions').getAttribute('title')).toBeNull()
    expect(disabled('palette-save-all')).toBe(true)
    expect(disabled('palette-discard-all')).toBe(true)
  })
})
