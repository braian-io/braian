// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isPaletteListNavKey, isPaletteListTransitionKey, resetPaletteListScroll, scrollPaletteActiveItem } from './palette-list-scroll'

describe('palette-list-scroll', () => {
  it('recognizes list navigation keys', () => {
    expect(isPaletteListNavKey('ArrowDown')).toBe(true)
    expect(isPaletteListNavKey('PageUp')).toBe(true)
    expect(isPaletteListNavKey('Enter')).toBe(false)
  })

  it('recognizes transition keys that should scroll the list', () => {
    expect(isPaletteListTransitionKey('ArrowDown')).toBe(true)
    expect(isPaletteListTransitionKey('ArrowLeft')).toBe(true)
    expect(isPaletteListTransitionKey('Enter')).toBe(true)
    expect(isPaletteListTransitionKey('a')).toBe(false)
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

  it('clears a stale scroll offset when the active row is already in the viewport', () => {
    const list = document.createElement('div')
    list.scrollTop = 240
    const item = document.createElement('div')
    item.className = 'hit on'
    list.appendChild(item)
    document.body.append(list)
    const box = {
      top: 10,
      bottom: 34,
      left: 0,
      right: 200,
      width: 200,
      height: 24,
      x: 0,
      y: 10,
      toJSON: () => ({}),
    } as DOMRect
    list.getBoundingClientRect = () =>
      ({ ...box, top: 0, bottom: 120, height: 120, y: 0 }) as DOMRect
    item.getBoundingClientRect = () => box

    resetPaletteListScroll(list)
    expect(list.scrollTop).toBe(0)

    list.remove()
  })
})