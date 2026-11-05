// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Login } from './shell'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return methods
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock }
})

afterEach(() => {
  cleanup()
  for (const fn of Object.values(mock)) fn.mockReset()
})

describe('Login accessibility', () => {
  it('announces the error and links both fields to it', async () => {
    mock.post.mockRejectedValue(new Error('Wrong email or password.'))
    render(<Login onDone={() => undefined} />)

    const email = screen.getByTestId('email')
    const password = screen.getByTestId('password')
    expect(email.getAttribute('aria-invalid')).toBeNull()
    expect(email.getAttribute('aria-describedby')).toBeNull()
    expect(password.getAttribute('aria-invalid')).toBeNull()
    expect(password.getAttribute('aria-describedby')).toBeNull()

    fireEvent.change(password, { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert.getAttribute('id')).toBe('login-error')
    expect(alert.textContent).toBe('Wrong email or password.')

    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe('login-error')
    expect(password.getAttribute('aria-invalid')).toBe('true')
    expect(password.getAttribute('aria-describedby')).toBe('login-error')
  })
})
