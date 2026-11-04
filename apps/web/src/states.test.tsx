// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StateNote } from './states'
import { copy } from './i18n'

afterEach(() => cleanup())

describe('state note', () => {
  it('announces loading and empty states with status', () => {
    const { rerender } = render(<StateNote tone="loading" title={copy.loadingObjects} />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(copy.loadingObjects)).toBeTruthy()

    rerender(<StateNote tone="empty" title={copy.noObjects} />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(copy.noObjects)).toBeTruthy()
  })

  it('announces errors with alert', () => {
    render(<StateNote tone="error" title={copy.objectsError} detail={copy.validation} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(copy.objectsError)).toBeTruthy()
    expect(screen.getByText(copy.validation)).toBeTruthy()
  })
})
