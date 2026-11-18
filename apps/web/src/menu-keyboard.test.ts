// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { focusAfterMenuTab, tabStopsInDocument } from './menu-keyboard'

function button(id: string) {
  const el = document.createElement('button')
  el.type = 'button'
  el.id = id
  el.textContent = id
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('menu keyboard', () => {
  it('lists tab stops in document order', () => {
    const a = button('a')
    const b = button('b')
    expect(tabStopsInDocument()).toEqual([a, b])
  })

  it('moves focus to the next tab stop after the menu trigger on Tab', () => {
    const trigger = button('trigger')
    const next = button('next')
    const later = button('later')
    trigger.focus()
    focusAfterMenuTab(trigger, false)
    expect(document.activeElement).toBe(next)
    focusAfterMenuTab(trigger, false)
    expect(document.activeElement).toBe(next)
    later.focus()
    focusAfterMenuTab(trigger, false)
    expect(document.activeElement).toBe(next)
  })

  it('moves focus to the previous tab stop on Shift+Tab', () => {
    const before = button('before')
    const trigger = button('trigger')
    const after = button('after')
    trigger.focus()
    focusAfterMenuTab(trigger, true)
    expect(document.activeElement).toBe(before)
    void after
  })
})