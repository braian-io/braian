import { afterEach, describe, expect, it } from 'vitest'
import { copy } from './i18n'
import { resetNewVersionGate, setNewVersionGate } from './new-version-gate'
import { registryPaletteRows } from './palette-registry-rows'
import { chordForCommand } from './shortcuts'

const agentChord = chordForCommand('agent:open')

function baseRows(theme: 'dark' | 'light') {
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
    expect(registryPaletteRows({ theme: 'dark' })).toEqual([...baseRows('dark'), reloadRow])
  })
})
