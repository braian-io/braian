// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  captureAgentOpener,
  pickAgentFocusRestore,
  resetAgentFocusForTests,
  restoreAgentFocus,
} from './agent-focus'

afterEach(() => {
  resetAgentFocusForTests()
  document.body.replaceChildren()
})

describe('pickAgentFocusRestore', () => {
  it('sends Escape to the left pane when one exists', () => {
    expect(pickAgentFocusRestore({
      leftPane: true,
      previous: true,
      lastPane: true,
      preferredPane: true,
      anyPane: true,
    })).toBe('left-pane')
  })

  it('returns to the opener, then the last pane, then any pane, and never stops with nothing', () => {
    expect(pickAgentFocusRestore({
      leftPane: false,
      previous: true,
      lastPane: true,
      preferredPane: true,
      anyPane: true,
    })).toBe('previous')
    expect(pickAgentFocusRestore({
      leftPane: false,
      previous: false,
      lastPane: true,
      preferredPane: true,
      anyPane: true,
    })).toBe('last-pane')
    expect(pickAgentFocusRestore({
      leftPane: false,
      previous: false,
      lastPane: false,
      preferredPane: true,
      anyPane: true,
    })).toBe('preferred-pane')
    expect(pickAgentFocusRestore({
      leftPane: false,
      previous: false,
      lastPane: false,
      preferredPane: false,
      anyPane: true,
    })).toBe('any-pane')
    expect(pickAgentFocusRestore({
      leftPane: false,
      previous: false,
      lastPane: false,
      preferredPane: false,
      anyPane: false,
    })).toBeNull()
  })
})

function mountDock() {
  document.body.innerHTML = `
    <div data-testid="dock" data-focus="products">
      <section class="pane" data-pane="products" tabindex="-1">
        <div class="grid" id="grid" tabindex="0" data-testid="object-table"></div>
      </section>
      <section class="pane" data-pane="agent" tabindex="-1">
        <div data-testid="agent-view"><textarea id="ask" data-testid="agent-follow-up"></textarea></div>
      </section>
    </div>`
  const grid = document.getElementById('grid') as HTMLElement
  const ask = document.getElementById('ask') as HTMLTextAreaElement
  return { grid, ask }
}

describe('restoreAgentFocus', () => {
  it('does not replace the opener with the command palette', () => {
    const { grid } = mountDock()
    const palette = document.createElement('div')
    palette.setAttribute('data-testid', 'command-palette')
    const input = document.createElement('input')
    palette.append(input)
    document.body.append(palette)
    grid.focus()
    captureAgentOpener()
    input.focus()
    captureAgentOpener()
    input.remove()
    palette.remove()
    expect(restoreAgentFocus({ leftPaneId: null, preferredPaneId: 'products' })).toBe(grid)
  })

  it('returns focus to the element that had it before the agent opened', () => {
    const { grid, ask } = mountDock()
    grid.focus()
    captureAgentOpener()
    ask.focus()
    captureAgentOpener()
    const target = restoreAgentFocus({ leftPaneId: null, preferredPaneId: 'products' })
    expect(target).toBe(grid)
    expect(document.activeElement).toBe(grid)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('focuses the left pane when Escape has one, even if the opener is still there', () => {
    const { grid, ask } = mountDock()
    grid.focus()
    captureAgentOpener()
    ask.focus()
    const target = restoreAgentFocus({ leftPaneId: 'products', preferredPaneId: 'agent' })
    expect(target).toBe(document.querySelector('section.pane[data-pane="products"]'))
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).not.toBe(ask)
  })

  it('focuses a pane when there is no left pane and the opener is gone', () => {
    const { grid, ask } = mountDock()
    grid.focus()
    captureAgentOpener()
    ask.focus()
    document.querySelector('section.pane[data-pane="products"]')?.remove()
    const target = restoreAgentFocus({ leftPaneId: null, preferredPaneId: null })
    expect(target).toBe(document.querySelector('section.pane[data-pane="agent"]'))
    expect(document.activeElement?.tagName).not.toBe('BODY')
    expect(document.activeElement?.closest('section.pane')).not.toBeNull()
  })

  it('focuses the remaining pane after the agent pane itself is gone', () => {
    const { grid, ask } = mountDock()
    grid.focus()
    captureAgentOpener()
    ask.focus()
    document.querySelector('section.pane[data-pane="agent"]')?.remove()
    const target = restoreAgentFocus({ leftPaneId: null, preferredPaneId: 'products' })
    expect(target).toBe(grid)
    expect(document.activeElement).not.toBe(document.body)
  })
})
