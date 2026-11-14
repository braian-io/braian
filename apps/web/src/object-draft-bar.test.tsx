// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copy } from './i18n'
import { ObjectDraftBar } from './object-draft-bar'

afterEach(() => cleanup())

function bar(pending?: boolean) {
  return render(
    <ObjectDraftBar
      count={1}
      canSave
      canDiscard
      saveReason=""
      discardReason=""
      pending={pending}
      onSave={vi.fn()}
      onDiscard={vi.fn()}
    />,
  )
}

describe('ObjectDraftBar pending state', () => {
  it('shows Saving and disables Save and Discard while a save is in flight', () => {
    bar(true)
    const save = screen.getByTestId('review-and-save')
    const discard = screen.getByTestId('discard-draft')
    expect(save.textContent).toBe(copy.saving)
    expect((save as HTMLButtonElement).disabled).toBe(true)
    expect(discard.textContent).toBe(copy.discard)
    expect((discard as HTMLButtonElement).disabled).toBe(true)
  })

  it('returns to Save and Discard when the request finishes', () => {
    const { rerender } = bar(true)
    expect(screen.getByTestId('review-and-save').textContent).toBe(copy.saving)
    rerender(
      <ObjectDraftBar
        count={1}
        canSave
        canDiscard
        saveReason=""
        discardReason=""
        pending={false}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    const save = screen.getByTestId('review-and-save')
    expect(save.textContent).toBe(copy.reviewAndSave)
    expect((save as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByTestId('discard-draft') as HTMLButtonElement).disabled).toBe(false)
  })
})
