import { describe, expect, it } from 'vitest'
import { agentSessionLayout, controllingAgentRuns, markedAgentViewIds } from './agent-session'
import type { AgentRunSummary } from './agent-runs'
import { tabGroup, type LayoutDoc } from './layout'

function run(patch: Partial<AgentRunSummary>): AgentRunSummary {
  return {
    id: 'run',
    title: 'prompt',
    status: 'working',
    mode: 'foreground',
    session_kind: 'own',
    hidden: true,
    tab_open: true,
    created_at: '2026-11-05T12:00:00Z',
    updated_at: '2026-11-05T12:00:00Z',
    session: { views: ['products'], focus: 'products' },
    ...patch,
  }
}

const doc: LayoutDoc = {
  id: 'ws',
  title: 'Products',
  layout: {
    type: 'split',
    dir: 'horizontal',
    ratios: [0.6, 0.4],
    children: [tabGroup(['products', 'agent']), tabGroup(['detail'])],
  },
  focus: 'products',
}

describe('agent session layout', () => {
  it('replaces the person layout with the views the agent is working in', () => {
    const next = agentSessionLayout(doc, ['products', 'agent'])
    expect(next.layout).toEqual({ type: 'tabs', views: ['products', 'agent'], active: 0 })
    expect(next.focus).toBe('products')
    expect(next.zoom).toBeUndefined()
  })

  it('marks the user session while the agent is working, and the hidden session only while it is shown', () => {
    const runs = [
      run({ id: 'hidden', session_kind: 'own', status: 'working', session: { views: ['products'] } }),
      run({ id: 'screen', session_kind: 'user', status: 'working', session: { views: ['detail'] } }),
    ]
    expect(markedAgentViewIds(runs, null)).toEqual(['detail'])
    expect(markedAgentViewIds(runs, 'hidden')).toEqual(['products', 'detail'])
    expect(controllingAgentRuns(runs).map((item) => item.id)).toEqual(['screen'])
    expect(controllingAgentRuns([run({ id: 'stopped', session_kind: 'user', status: 'paused' })])).toEqual([])
  })
})
