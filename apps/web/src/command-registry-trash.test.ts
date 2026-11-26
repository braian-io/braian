import { describe, expect, it } from 'vitest'
import { commandsForContext, paletteCommandsFromRegistry } from './command-registry'
import { registryPaletteRows } from './palette-registry-rows'

describe('trash commands', () => {
  it('stays out of Ctrl+K until a trash row is active', () => {
    const without = paletteCommandsFromRegistry({}).map((command) => command.id)
    expect(without).not.toContain('trash:restore')
    expect(without).not.toContain('trash:purge')
    const rows = registryPaletteRows({ target: { trashKind: 'object' } })
    expect(rows.map((row) => row.id)).toContain('trash:restore')
    expect(rows.map((row) => row.id)).toContain('trash:purge')
  })

  it('shows restore and purge in the trash context menu when a row is targeted', () => {
    const menu = commandsForContext('trash', { trashKind: 'object', trashLabel: 'Bread' })
    expect(menu.map((command) => command.id)).toContain('trash:restore')
    expect(menu.map((command) => command.id)).toContain('trash:purge')
    expect(commandsForContext('trash', {}).map((command) => command.id)).not.toContain('trash:restore')
  })
})