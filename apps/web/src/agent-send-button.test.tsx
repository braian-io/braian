// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from './components/ui/tooltip'
import { copy } from './i18n'

const agentViewSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'agent-view.tsx'), 'utf8')

const runDetail = {
  id: 'run-1',
  title: 'Agent',
  status: 'done',
  mode: 'foreground',
  session_kind: 'own',
  hidden: false,
  tab_open: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  messages: [],
  proposals: [],
  session: { views: [] },
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
  useQuery: () => ({
    isPending: false,
    isError: false,
    data: runDetail,
    error: null,
    refetch: vi.fn(),
  }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}))

vi.mock('./agent-runs', () => ({
  AgentRunError: class AgentRunError extends Error {
    status: number
    constructor(status: number) {
      super('missing')
      this.status = status
    }
  },
  agentDisplayText: (text: string) => text,
  agentSessionAccessibleDescription: () => '',
  agentSessionHeaderTitle: () => 'Agent',
  agentStatusLabel: () => 'Done',
  backgroundNotices: () => [],
  cleanAgentError: (text: string) => text,
  fetchAgentRun: vi.fn(),
  followAgentRun: vi.fn(),
  mergeRunSummary: vi.fn(),
  patchAgentRun: vi.fn(),
  requestAgentNotice: vi.fn(),
  requestShowAgentSession: vi.fn(),
}))

vi.mock('./agent-session', () => ({
  subscribeViewingAgent: (listener: () => void) => {
    listener()
    return () => {}
  },
  viewingAgentRunId: () => null,
}))

vi.mock('./agent-focus', () => ({
  captureAgentOpener: vi.fn(),
  markAgentFocusRelease: vi.fn(),
}))

vi.mock('./command-registry', () => ({
  runCommand: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

describe('agent follow send control', () => {
  it('uses a send icon with tooltip copy and no visible button label', () => {
    expect(agentViewSrc).toContain('<Send size={14}')
    expect(agentViewSrc).toContain('copy.agentSendTooltip')
    expect(agentViewSrc).not.toMatch(/>\s*\{waiting \? copy\.agentResume : copy\.agentSend\}\s*</)
    expect(copy.agentSendTooltip).toBe('Send (Enter)')
  })

  it('keeps an accessible Send name on the submit icon', async () => {
    const { AgentView } = await import('./agent-view')
    render(
      <TooltipProvider>
        <AgentView runId="run-1" title="Agent" push={() => {}} />
      </TooltipProvider>,
    )
    const send = await screen.findByRole('button', { name: 'Send' })
    expect(send.getAttribute('data-testid')).toBe('agent-send')
    expect(send.textContent?.trim()).toBe('')
  })
})