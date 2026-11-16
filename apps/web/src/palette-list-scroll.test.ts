// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isPaletteListNavKey, scrollPaletteActiveItem } from './palette-list-scroll'

describe('palette-list-scroll', () => {
  it('recognizes list navigation keys', () => {
    expect(isPaletteListNavKey('ArrowDown')).toBe(true)
    expect(isPaletteListNavKey('PageUp')).toBe(true)
    expect(isPaletteListNavKey('Enter')).toBe(false)
  })

  it('scrolls the list only enough to reveal the active row', () => {
    const list = document.createElement('div')
    Object.defineProperty(list, 'clientHeight', { value: 100, configurable: true })
    list.style.overflow = 'auto'
    list.scrollTop = 0

    const item = document.createElement('div')
    item.className = 'hit on'
    list.appendChild(item)
    document.body.append(list)

    list.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 100,
        left: 0,
        right: 200,
        width: 200,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    item.getBoundingClientRect = () =>
      ({
        top: 140,
        bottom: 164,
        left: 0,
        right: 200,
        width: 200,
        height: 24,
        x: 0,
        y: 140,
        toJSON: () => ({}),
      }) as DOMRect

    scrollPaletteActiveItem(list)
    expect(list.scrollTop).toBe(64)

    list.remove()
  })
})