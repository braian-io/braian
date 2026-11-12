import { describe, expect, it } from 'vitest'
import { commandTitle, commandsForContext } from './command-registry'
import { copy } from './i18n'

describe('Reset to default in the command registry (row 51a)', () => {
  it('shows the command in the header menu only when the user has an override', () => {
    const withOverride = commandsForContext('table-header', {
      column: 'brand',
      viewId: 'view-1',
      columnPrefsOverride: true,
    })
    const command = withOverride.find((item) => item.id === 'columns:reset')
    expect(command).toBeTruthy()
    expect(commandTitle(command!)).toBe('Reset to default')
    expect(commandTitle(command!)).toBe(copy.resetToDefault)

    const withoutOverride = commandsForContext('table-header', {
      column: 'brand',
      viewId: 'view-1',
      columnPrefsOverride: false,
    })
    expect(withoutOverride.map((item) => item.id)).not.toContain('columns:reset')

    const withoutView = commandsForContext('table-header', {
      column: 'brand',
      columnPrefsOverride: true,
    })
    expect(withoutView.map((item) => item.id)).not.toContain('columns:reset')
  })

  it('is available from cell and row menus too, for the same focused view', () => {
    for (const context of ['cell', 'row'] as const) {
      const ids = commandsForContext(context, {
        objectId: 'object-1',
        viewId: 'view-1',
        columnPrefsOverride: true,
      }).map((item) => item.id)
      expect(ids).toContain('columns:reset')
    }
  })
})
