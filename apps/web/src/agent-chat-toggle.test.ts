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

  it('reopens the most recent hidden agent session when nothing is open', () => {
    expect(decideAgentToggle(['products'], agents)).toEqual({
      kind: 'reopen-hidden',
      viewId: 'a2',
      title: 'Agent two',
    })
  })

  it('opens the palette in AI mode when no agent views exist', () => {
    expect(decideAgentToggle(['products'], [])).toEqual({ kind: 'palette-ai' })
  })
})