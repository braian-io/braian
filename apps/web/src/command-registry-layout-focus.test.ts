import { describe, expect, it } from 'vitest'
import { commandsForContext, registryCommands } from './command-registry'
import { chordForCommand } from './shortcuts'

describe('layout focus commands in the registry (Notion 107 slice 3)', () => {
  it('registers focus directions with Alt chords from the shortcut table', () => {
    for (const [id, chord] of [
      ['layout:focus:left', 'Alt+←'],
      ['layout:focus:right', 'Alt+→'],
      ['layout:focus:up', 'Alt+↑'],
      ['layout:focus:down', 'Alt+↓'],
    ] as const) {
      const command = registryCommands.find((item) => item.id === id)
      expect(command?.kbd).toBe(chordForCommand(id))
      expect(command?.kbd).toBe(chord)
      expect(command?.contexts).toContain('dock-view')
    }
  })

  it('lists focus commands on the dock-view menu', () => {
    const ids = commandsForContext('dock-view', {}).map((command) => command.id)
    expect(ids).toEqual(expect.arrayContaining([
      'layout:focus:left',
      'layout:focus:right',
      'layout:focus:up',
      'layout:focus:down',
    ]))
  })
})
