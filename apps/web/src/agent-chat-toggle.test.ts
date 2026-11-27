import { describe, expect, it } from 'vitest'
import { decideAgentToggle } from './agent-chat-toggle'

const agents = [
  { id: 'a1', title: 'Agent one', type: 'agent' },
  { id: 'a2', title: 'Agent two', type: 'agent' },
]

describe('decideAgentToggle', () => {
  it('closes every open agent pane regardless of which view is focused', () => {
    expect(decideAgentToggle(['products', 'a1'], agents)).toEqual({
      kind: 'close',
      viewIds: ['a1'],
    })
    expect(decideAgentToggle(['products', 'detail', 'a1', 'a2'], agents)).toEqual({
      kind: 'close',
      viewIds: ['a1', 'a2'],
    })
  })

  it('opens a compose thread when no agent pane is open', () => {
    expect(decideAgentToggle(['products'], agents)).toEqual({ kind: 'open-compose' })
    expect(decideAgentToggle(['products'], [])).toEqual({ kind: 'open-compose' })
  })
})