import { describe, expect, it } from 'vitest'
import { markShortcutUsed, shortcutTipCopy, takeShortcutTip } from './shortcut-tip'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

describe('shortcut tips', () => {
  it('tells the user how Ctrl+Alt+← moves the view', () => {
    expect(shortcutTipCopy('Ctrl+Alt+←', 'Move the focused view left')).toBe('Tip: Ctrl+Alt+← moves the view left')
    expect(shortcutTipCopy('Ctrl+Alt+→', 'Move the focused view right')).toBe('Tip: Ctrl+Alt+→ moves the view right')
  })

  it('shows a tip at most three times and never after the shortcut was used', () => {
    const store = memoryStorage()
    const tip = () => takeShortcutTip('layout:move_view_left', 'Ctrl+Alt+←', 'Move the focused view left', store)
    expect(tip()).toBe('Tip: Ctrl+Alt+← moves the view left')
    expect(tip()).toBe('Tip: Ctrl+Alt+← moves the view left')
    expect(tip()).toBe('Tip: Ctrl+Alt+← moves the view left')
    expect(tip()).toBeNull()

    const used = memoryStorage()
    expect(takeShortcutTip('layout:move_view_left', 'Ctrl+Alt+←', 'Move the focused view left', used)).toBeTruthy()
    markShortcutUsed('layout:move_view_left', used)
    expect(takeShortcutTip('layout:move_view_left', 'Ctrl+Alt+←', 'Move the focused view left', used)).toBeNull()
  })
})
