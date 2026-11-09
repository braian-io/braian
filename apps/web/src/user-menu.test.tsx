// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { UserMenu, userInitial } from './user-menu'

beforeAll(() => {
  // Radix menus measure and scroll; jsdom has neither.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
})

afterEach(cleanup)

function mount(overrides: Partial<Parameters<typeof UserMenu>[0]> = {}) {
  const onToggleTheme = vi.fn()
  const onOpenTrash = vi.fn()
  const onSignOut = vi.fn()
  render(
    <UserMenu
      email="admin@braian.io"
      role="admin"
      connection="online"
      theme="dark"
      onToggleTheme={onToggleTheme}
      onOpenTrash={onOpenTrash}
      onSignOut={onSignOut}
      {...overrides}
    />,
  )
  return { onToggleTheme, onOpenTrash, onSignOut, trigger: screen.getByTestId('user-menu') }
}

describe('UserMenu', () => {
  it('shows the initial and keeps the Account trigger in the tab order', () => {
    const { trigger } = mount()
    expect(trigger.textContent).toBe('A')
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('aria-label')).toBe('Account')
    expect((trigger as HTMLButtonElement).tabIndex).toBe(0)
    expect((trigger as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByTestId('user-menu-email')).toBeNull()
  })

  it('opens with the keyboard', () => {
    const { trigger } = mount()
    expect(screen.queryByTestId('user-menu-email')).toBeNull()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByTestId('user-menu-email').textContent).toBe('admin@braian.io')
    expect(screen.getByTestId('user-menu-role').textContent).toBe('admin')
    expect(screen.getByTestId('user-menu-status').textContent).toBe('Connected')
  })

  it('offers the opposite theme and signs out', () => {
    const { trigger, onToggleTheme, onOpenTrash, onSignOut } = mount()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByTestId('user-menu-theme').textContent).toBe('Light mode')
    fireEvent.click(screen.getByTestId('user-menu-theme'))
    expect(onToggleTheme).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(screen.getByTestId('user-menu-trash'))
    expect(onOpenTrash).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(screen.getByTestId('user-menu-sign-out'))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape', () => {
    const { trigger } = mount()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByTestId('user-menu-content')).toBeTruthy()
    fireEvent.keyDown(screen.getByTestId('user-menu-content'), { key: 'Escape' })
    expect(screen.queryByTestId('user-menu-content')).toBeNull()
  })

  it('shows offline in the menu', () => {
    const { trigger } = mount({ connection: 'offline', theme: 'light' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByTestId('user-menu-status').textContent).toBe('Offline')
    expect(screen.getByTestId('user-menu-theme').textContent).toBe('Dark mode')
  })
})

describe('userInitial', () => {
  it('prefers email, then handle, then name', () => {
    expect(userInitial({ name: 'Demo Admin', email: 'admin@braian.io' })).toBe('A')
    expect(userInitial({ name: 'grace', handle: 'ada', email: 'a@b' })).toBe('A')
    expect(userInitial({ name: 'grace', handle: 'ada' })).toBe('A')
    expect(userInitial({ name: 'grace' })).toBe('G')
    expect(userInitial({})).toBe('?')
  })
})
