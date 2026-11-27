import { describe, expect, it } from 'vitest'
import { commandTitle, commandsForContext, paletteCommandsFromRegistry } from './command-registry'
import { copy } from './i18n'
import { chordForCommand } from './shortcuts'

const dockMenuIds = (target: Record<string, unknown>) =>
  commandsForContext('dock-view', target).map((command) => command.id)

describe('dock-view context menu (decision 3c)', () => {
  it('lists only add view, select source, maximize, and close on object tables', () => {
    expect(dockMenuIds({ viewId: 'v1', viewType: 'object_table' })).toEqual([
      'layout:add-view',
      'view:select-source',
      'layout:zoom',
      'layout:close_view',
    ])
  })

  it('omits select source on non-table panes', () => {
    expect(dockMenuIds({ viewId: 'v1', viewType: 'graph' })).toEqual([
      'layout:add-view',
      'layout:zoom',
      'layout:close_view',
    ])
  })

  it('shows Restore instead of Maximize when the pane is zoomed', () => {
    const zoomed = commandsForContext('dock-view', { viewId: 'v1', viewType: 'object_table', paneZoomed: true })
    const maximize = zoomed.find((command) => command.id === 'layout:zoom')
    expect(maximize).toBeTruthy()
    expect(commandTitle(maximize!, { paneZoomed: true })).toBe(copy.restore)
    expect(commandTitle(maximize!, {})).toBe(copy.maximize)
  })

  it('keeps split, move and focus layout commands in Ctrl+K', () => {
    const paletteIds = paletteCommandsFromRegistry({ viewId: 'v1', viewType: 'object_table' }).map((command) => command.id)
    for (const id of [
      'layout:split-left',
      'layout:split-right',
      'layout:split-top',
      'layout:split-bottom',
      'layout:move_view_left',
      'layout:move_view_right',
      'layout:move_view_up',
      'layout:move_view_down',
    ]) {
      expect(paletteIds, id).toContain(id)
    }
    const splitRight = paletteCommandsFromRegistry({}).find((command) => command.id === 'layout:split-right')
    expect(splitRight?.keywords).toEqual(expect.arrayContaining(['split', 'right']))
    const moveRight = paletteCommandsFromRegistry({}).find((command) => command.id === 'layout:move_view_right')
    expect(moveRight?.kbd).toBe(chordForCommand('layout:move_view_right'))
  })
})