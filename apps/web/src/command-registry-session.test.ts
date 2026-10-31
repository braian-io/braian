import { describe, expect, it } from 'vitest'
import { commandsForContext, registryCommands } from './command-registry'
import { setNewVersionGate, resetNewVersionGate } from './new-version-gate'
import { chordForCommand, findShortcutConflicts, shortcuts } from './shortcuts'

describe('session commands in the registries', () => {
  it('registers theme, agent, sign-out, and reload-new-version once each', () => {
    const ids = ['theme:toggle', 'agent:open', 'session:sign-out', 'session:reload-new-version']
    for (const id of ids) {
      expect(registryCommands.filter((command) => command.id === id)).toHaveLength(1)
    }
    expect(new Set(registryCommands.map((command) => command.id)).size).toBe(registryCommands.length)
  })

  it('shows reload-new-version only while the new-version gate is open', () => {
    const command = registryCommands.find((entry) => entry.id === 'session:reload-new-version')
    expect(command?.when).toBeTypeOf('function')
    resetNewVersionGate()
    expect(command?.when?.({})).toBe(false)
    setNewVersionGate(true)
    expect(command?.when?.({})).toBe(true)
    resetNewVersionGate()
  })

  it('keeps shortcut chords conflict-free with agent:open linked', () => {
    expect(chordForCommand('agent:open')).toBe('Ctrl+J')
    expect(findShortcutConflicts(shortcuts)).toEqual([])
  })
})

describe('view:select-source (Notion 103 PR 1)', () => {
  it('is registered once and listed on object_table dock menus', () => {
    expect(registryCommands.filter((command) => command.id === 'view:select-source')).toHaveLength(1)
    const ids = commandsForContext('dock-view', { viewType: 'object_table' }).map((item) => item.id)
    expect(ids).toContain('view:select-source')
    const other = commandsForContext('dock-view', { viewType: 'graph' }).map((item) => item.id)
    expect(other).not.toContain('view:select-source')
  })
})
