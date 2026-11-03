import { describe, expect, it } from 'vitest'
import { copy } from './i18n'
import { commandsForContext, paletteCommandsFromRegistry } from './command-registry'

describe('standard table commands', () => {
  it('keeps table-wide actions in Ctrl+K and out of the row menu', () => {
    const palette = paletteCommandsFromRegistry({ typeKey: 'product', singular: 'product' })
    const titles = palette.map((command) =>
      typeof command.title === 'function' ? command.title({ typeKey: 'product', singular: 'product' }) : command.title,
    )
    expect(titles).toContain(copy.massEdit)
    expect(titles).toContain(copy.filterBy)
    expect(titles).toContain(copy.export)
    expect(titles).toContain(copy.exportColumns)
    expect(titles.some((title) => title.toLowerCase().includes('new'))).toBe(true)

    const menu = commandsForContext('row', { objectId: 'id-1', typeKey: 'product', singular: 'product' })
    const menuTitles = menu.map((command) =>
      typeof command.title === 'function' ? command.title({ objectId: 'id-1', typeKey: 'product', singular: 'product' }) : command.title,
    )
    expect(menuTitles).not.toContain(copy.massEdit)
    expect(menuTitles).not.toContain(copy.filterBy)
    expect(menuTitles).not.toContain(copy.export)
    expect(menuTitles).not.toContain(copy.exportColumns)
    expect(menuTitles).not.toContain(copy.selectFields)
    expect(menu.some((command) => command.id === 'object:new')).toBe(false)
    expect(menu.some((command) => command.id === 'object:open')).toBe(true)
  })
})
