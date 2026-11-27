import { describe, expect, it } from 'vitest'
import { isComposeRun, pickEmptyComposeRun } from './agent-compose'
import type { AgentRunSummary as Run } from './agent-runs'

function run(partial: Partial<Run>): Run {
  return {
    id: 'run-1',
    title: 'Agent',
    status: 'waiting',
    mode: 'foreground',
    session_kind: 'own',
    hidden: false,
    tab_open: false,
    created_at: '2026-11-17T10:00:00Z',
    updated_at: '2026-11-17T10:00:00Z',
    ...partial,
  }
}

describe('isComposeRun', () => {
  it('matches waiting runs with no first message', () => {
    expect(isComposeRun(run({ status: 'waiting', first_message: null }))).toBe(true)
    expect(isComposeRun(run({ status: 'waiting', first_message: '  ' }))).toBe(true)
  })

  it('rejects runs that already have a question', () => {
    expect(isComposeRun(run({ status: 'waiting', first_message: 'rename product X' }))).toBe(false)
    expect(isComposeRun(run({ status: 'done', first_message: null }))).toBe(false)
  })
})

describe('pickEmptyComposeRun', () => {
  const views = [{ id: 'agent-a', type: 'agent', state: { run_id: 'empty-a' } }]

  it('reuses a closed empty compose run in this workspace', () => {
    const runs = [
      run({ id: 'empty-a', view_id: 'agent-a', workspace_id: 'ws-1', updated_at: '2026-11-17T11:00:00Z' }),
      run({ id: 'empty-b', workspace_id: 'ws-1', updated_at: '2026-11-17T12:00:00Z' }),
    ]
    const picked = pickEmptyComposeRun(runs, 'ws-1', views, ['products'])
    expect(picked?.id).toBe('empty-a')
  })

  it('returns the newest empty run when none has a matching closed view', () => {
    const runs = [
      run({ id: 'empty-old', workspace_id: 'ws-1', updated_at: '2026-11-17T10:00:00Z' }),
      run({ id: 'empty-new', workspace_id: 'ws-1', updated_at: '2026-11-17T12:00:00Z' }),
    ]
    expect(pickEmptyComposeRun(runs, 'ws-1', [], ['products'])?.id).toBe('empty-new')
  })
})