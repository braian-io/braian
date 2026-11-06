// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button, buttonVariants } from './button'

afterEach(() => cleanup())

describe('button variants', () => {
  it('maps the standard variants to their classes', () => {
    expect(buttonVariants({ variant: 'default' })).toContain('btn-raised')
    expect(buttonVariants({ variant: 'primary' })).toContain('btn-accent')
    expect(buttonVariants({ variant: 'ghost' })).toContain('btn-ghost')
    expect(buttonVariants({ variant: 'icon' })).toContain('btn-ghost')
    expect(buttonVariants({ variant: 'icon' })).toContain('icon-btn')
    expect(buttonVariants({ variant: 'danger' })).toContain('btn-danger')
  })

  it('renders danger as a red action using the danger token', () => {
    render(<Button variant="danger">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('btn-danger')
  })
})
