import { describe, expect, it } from 'vitest'
import { commandTitle, commandsForContext, registryCommands } from './command-registry'
import { chordForCommand } from './shortcuts'

describe('column move commands in the registry (Notion 107 slice 1)', () => {
  it('registers left/right with Ctrl+Shift chords from the shortcut table', () => {
    const left = registryCommands.find((command) => command.id === 'column:move-left')
    const right = registryCommands.find((command) => command.id === 'column:move-right')
    expect(left?.kbd).toBe(chordForCommand('column:move-left'))
    expect(right?.kbd).toBe(chordForCommand('column:move-right'))
    expect(left?.kbd).toBe('Ctrl+Shift+←')
    expect(right?.kbd).toBe('Ctrl+Shift+→')
  })

  it('shows move commands on table-header when a column is targeted', () => {
    const target = { column: 'name', columnHeader: 'Name' }
    const ids = commandsForContext('table-header', target).map((command) => command.id)
    expect(ids).toContain('column:move-left')
    expect(ids).toContain('column:move-right')
    const left = commandsForContext('table-header', target).find((command) => command.id === 'column:move-left')
    expect(commandTitle(left!, target)).toBe('Move column left · Name')
  })

  it('hides move commands without a column target', () => {
    const ids = commandsForContext('table-header', {}).map((command) => command.id)
    expect(ids).not.toContain('column:move-left')
    expect(ids).not.toContain('column:move-right')
  })
})
