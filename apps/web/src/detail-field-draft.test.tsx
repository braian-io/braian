// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useCallback, useRef } from 'react'
import { DetailFieldDraftHost, useDetailFieldDraft, type DetailFieldDraftHandle } from './detail-field-draft'

function Field({ commitOk }: { commitOk: boolean }) {
  const commit = useCallback(() => commitOk, [commitOk])
  const discard = useCallback(() => undefined, [])
  useDetailFieldDraft({ commit, discard })
  return null
}

describe('DetailFieldDraftHost', () => {
  it('flush fails when any field commit fails', () => {
    const hostRef = { current: null as DetailFieldDraftHandle | null }
    render(
      <DetailFieldDraftHost ref={hostRef}>
        <Field commitOk />
        <Field commitOk={false} />
      </DetailFieldDraftHost>,
    )
    expect(hostRef.current?.flush()).toBe(false)
  })

  it('exposes discard to every registered field', () => {
    const discarded = vi.fn()
    function TrackingField() {
      const discard = useCallback(() => { discarded() }, [])
      const commit = useCallback(() => true, [])
      useDetailFieldDraft({ commit, discard })
      return null
    }
    const ref = { current: null as DetailFieldDraftHandle | null }
    render(
      <DetailFieldDraftHost ref={ref}>
        <TrackingField />
        <TrackingField />
      </DetailFieldDraftHost>,
    )
    ref.current?.discard()
    expect(discarded).toHaveBeenCalledTimes(2)
  })
})