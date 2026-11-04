// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copy } from '../i18n'
import { discardImport, requestCloseImport, showImportFixture } from './controller'
import { ImportScreen } from './view'

beforeEach(() => {
  showImportFixture('map')
})

afterEach(() => {
  cleanup()
  discardImport()
})

describe('import confirm dialog', () => {
  it('uses the shared dialog and closes on Escape', async () => {
    render(<ImportScreen />)
    requestCloseImport()

    const dialog = await screen.findByTestId('import-confirm')
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    expect(title?.textContent).toBe(copy.importCloseConfirm)
    expect(screen.getByRole('button', { name: copy.importYes })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.importNo })).toBeTruthy()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('import-confirm')).toBeNull())
  })
})
