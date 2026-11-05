import { afterEach, describe, expect, it } from 'vitest'
import { copy } from './i18n'
import { resetNewVersionGate, setNewVersionGate } from './new-version-gate'
import { registryColumnMovePaletteRows, registryLayoutFocusPaletteRows, registryPaletteRows } from './palette-registry-rows'
import { chordForCommand } from './shortcuts'

const agentChord = chordForCommand('agent:open')
const moveLeftChord = chordForCommand('layout:move_view_left')
const moveRightChord = chordForCommand('layout:move_view_right')
const moveUpChord = chordForCommand('layout:move_view_up')
const moveDownChord = chordForCommand('layout:move_view_down')
const zoomChord = chordForCommand('layout:zoom')
const closeViewChord = chordForCommand('layout:close_view')

function coreRows(theme: 'dark' | 'light') {
  return [
    {
      id: 'theme:toggle',
      group: 'views',
      title: theme === 'dark' ? copy.lightMode : copy.darkMode,
      subtitle: 'Toggle theme',
      keywords: ['theme', 'toggle', 'light', 'dark', 'mode'],
    },
    {
      id: 'agent:open',
      group: 'views',
      title: copy.openAgent,
      subtitle: 'Ask the agent',
      keywords: ['agent', 'ai', 'ask'],
      kbd: agentChord,
      shortcut: agentChord,
    },
    {
      id: 'session:sign-out',
      group: 'views',
      title: copy.signOut,
      subtitle: 'End this session',
      keywords: ['logout', 'log out', 'sign out', 'session'],
    },
  ]
}

function layoutDockPaletteRows() {
  return [
    {
      id: 'layout:move_view_left',
      group: 'views',
      title: copy.moveLeft,
      subtitle: 'Move the focused view left',
      kbd: moveLeftChord,
      shortcut: moveLeftChord,
    },
    {
      id: 'layout:move_view_right',
      group: 'views',
      title: copy.moveRight,
      subtitle: 'Move the focused view right',
      kbd: moveRightChord,
      shortcut: moveRightChord,
    },
    {
      id: 'layout:move_view_up',
      group: 'views',
      title: copy.moveUp,
      subtitle: 'Move the focused view up',
      kbd: moveUpChord,
      shortcut: moveUpChord,
    },
    {
      id: 'layout:move_view_down',
      group: 'views',
      title: copy.moveDown,
      subtitle: 'Move the focused view down',
      kbd: moveDownChord,
      shortcut: moveDownChord,
    },
    {
      id: 'layout:zoom',
      group: 'views',
      title: copy.maximize,
      subtitle: 'Show only the focused pane',
      kbd: zoomChord,
      shortcut: zoomChord,
    },
    {
      id: 'layout:close_view',
      group: 'views',
      title: copy.closeView,
      subtitle: 'Close the focused view',
      kbd: closeViewChord,
      shortcut: closeViewChord,
    },
  ]
}

function baseRows(theme: 'dark' | 'light') {
  return [...coreRows(theme), ...layoutDockPaletteRows()]
}

const reloadRow = {
  id: 'session:reload-new-version',
  group: 'views',
  title: copy.reloadToNewVersion,
  subtitle: copy.newVersionAvailable,
  keywords: ['reload', 'refresh', 'new version', 'update', 'deploy'],
}

describe('palette rows from registry commands', () => {
  afterEach(() => resetNewVersionGate())

  it('derives the palette:true rows in registry order for both themes', () => {
    expect(registryPaletteRows({ theme: 'dark', target: { feedbackEnabled: true } })).toEqual(baseRows('dark'))
    expect(registryPaletteRows({ theme: 'light', target: { feedbackEnabled: true } })).toEqual(baseRows('light'))
  })

  it('adds the reload row only while the new-version gate is open', () => {
    resetNewVersionGate()
    expect(registryPaletteRows({ theme: 'dark' }).map((row) => row.id)).not.toContain(
      'session:reload-new-version',
    )

    setNewVersionGate(true)
    // reload sits after sign-out and before the dock layout palette:true rows
    expect(registryPaletteRows({ theme: 'dark' })).toEqual([
      ...coreRows('dark'),
      reloadRow,
      ...layoutDockPaletteRows(),
    ])
  })
})

describe('column move palette rows from registry', () => {
  it('derives move-left/right with title, kbd and header keywords when a column is targeted', () => {
    const rows = registryColumnMovePaletteRows({ column: 'name', columnHeader: 'Name' })
    expect(rows.map((row) => row.id)).toEqual(['column:move-left', 'column:move-right'])
    expect(rows[0]).toMatchObject({
      title: 'Move column left · Name',
      subtitle: 'Name',
      kbd: chordForCommand('column:move-left'),
      shortcut: chordForCommand('column:move-left'),
    })
    expect(rows[0]?.keywords).toEqual(expect.arrayContaining(['column', 'move', 'left', 'Name']))
    expect(rows[1]).toMatchObject({
      title: 'Move column right · Name',
      subtitle: 'Name',
      kbd: chordForCommand('column:move-right'),
    })
  })

  it('omits move rows without a column target', () => {
    expect(registryColumnMovePaletteRows({})).toEqual([])
  })
})

describe('layout focus palette rows from registry', () => {
  it('derives the four pane-focus rows with Alt chords', () => {
    const rows = registryLayoutFocusPaletteRows()
    expect(rows.map((row) => row.id)).toEqual([
      'layout:focus:left',
      'layout:focus:right',
      'layout:focus:up',
      'layout:focus:down',
    ])
    expect(rows[0]).toMatchObject({
      title: 'Focus pane left',
      subtitle: 'Focus the neighbour on the left',
      kbd: chordForCommand('layout:focus:left'),
      shortcut: 'Alt+←',
    })
    expect(rows[1]?.kbd).toBe(chordForCommand('layout:focus:right'))
    expect(rows[2]?.kbd).toBe(chordForCommand('layout:focus:up'))
    expect(rows[3]?.kbd).toBe(chordForCommand('layout:focus:down'))
  })
})

describe('layout move/zoom/close palette rows from registry', () => {
  it('exposes move_view_*/zoom/close via palette:true with dock titles and chords', () => {
    const rows = registryPaletteRows({ theme: 'dark' })
    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining([
      'layout:move_view_left',
      'layout:move_view_right',
      'layout:move_view_up',
      'layout:move_view_down',
      'layout:zoom',
      'layout:close_view',
    ]))
    expect(rows.find((row) => row.id === 'layout:move_view_left')).toMatchObject({
      title: copy.moveLeft,
      subtitle: 'Move the focused view left',
      kbd: chordForCommand('layout:move_view_left'),
      shortcut: chordForCommand('layout:move_view_left'),
    })
    expect(rows.find((row) => row.id === 'layout:zoom')).toMatchObject({
      title: copy.maximize,
      kbd: chordForCommand('layout:zoom'),
    })
    expect(rows.find((row) => row.id === 'layout:close_view')).toMatchObject({
      title: copy.closeView,
      kbd: chordForCommand('layout:close_view'),
    })
  })
})
