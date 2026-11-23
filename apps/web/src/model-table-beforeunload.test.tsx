// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelTableBeforeUnload } from './model-table-beforeunload'
import { registerModelTableDraft } from './model-table-draft'

describe('ModelTableBeforeUnload', () => {
  afterEach(() => {
    registerModelTableDraft(null)
    vi.restoreAllMocks()
  })

  it('registers beforeunload only while the table draft is dirty', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<ModelTableBeforeUnload />)
    expect(add).not.toHaveBeenCalledWith('beforeunload', expect.any(Function))
    registerModelTableDraft({
      dirty: () => true,
      discard: () => undefined,
      review: async () => undefined,
    })
    await waitFor(() => expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function)))
    registerModelTableDraft({
      dirty: () => false,
      discard: () => undefined,
      review: async () => undefined,
    })
    await waitFor(() => expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function)))
    unmount()
  })
})