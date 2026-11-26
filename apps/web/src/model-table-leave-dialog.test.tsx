// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelTableLeaveDialog } from './model-table-leave-dialog'
import {
  cancelModelTableLeave,
  modelTableLeaveRequest,
  registerModelTableDraft,
  tryModelTableLeave,
} from './model-table-draft'

describe('ModelTableLeaveDialog', () => {
  afterEach(() => {
    registerModelTableDraft(null)
    cancelModelTableLeave()
  })

  it('closes after a successful review save', async () => {
    let dirty = true
    const review = vi.fn(async () => {
      dirty = false
    })
    registerModelTableDraft({
      dirty: () => dirty,
      discard: () => { dirty = false },
      review,
    })
    render(<ModelTableLeaveDialog />)
    tryModelTableLeave(() => undefined)
    await waitFor(() => expect(screen.getByTestId('model-table-leave-dialog')).toBeTruthy())
    fireEvent.click(screen.getByTestId('model-table-leave-review'))
    await waitFor(() => {
      expect(review).toHaveBeenCalled()
      expect(modelTableLeaveRequest()).toBeNull()
    })
    await waitFor(() => expect(screen.queryByTestId('model-table-leave-dialog')).toBeNull())
  })
})