// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getObjectDraftSnapshot, paintObjectCell, resetObjectDrafts, stageObjectCell, subscribeObjectDrafts } from './object-draft'

function TableName({ serverText, serverVersion }: { serverText: string; serverVersion: number }) {
  useSyncExternalStore(subscribeObjectDrafts, getObjectDraftSnapshot, getObjectDraftSnapshot)
  const painted = paintObjectCell({
    objectId: 'obj-1',
    columnId: 'name',
    attribute: 'name',
    language: 'en',
    serverText,
    serverVersion,
  })
  return (
    <div>
      <span data-testid="table-name">{painted.text}</span>
      <button
        type="button"
        data-testid="enter"
        onClick={() => stageObjectCell({
          objectId: 'obj-1',
          attribute: 'name',
          columnId: 'name',
          language: 'en',
          baseVersion: serverVersion,
          originalText: painted.originalText ?? serverText,
          proposedText: 'QA name',
          value: 'QA name',
        })}
      >
        Enter
      </button>
    </div>
  )
}

function DetailName({ serverText, serverVersion }: { serverText: string; serverVersion: number }) {
  useSyncExternalStore(subscribeObjectDrafts, getObjectDraftSnapshot, getObjectDraftSnapshot)
  const painted = paintObjectCell({
    objectId: 'obj-1',
    columnId: 'name',
    attribute: 'name',
    language: 'en',
    serverText,
    serverVersion,
  })
  return <span data-testid="detail-name">{painted.text}</span>
}

afterEach(() => cleanup())
beforeEach(() => resetObjectDrafts())

describe('table and Detail', () => {
  it('shows the same value after Enter while an older read is still on screen', () => {
    const { rerender } = render(
      <>
        <TableName serverText="Organic Apples" serverVersion={3} />
        <DetailName serverText="Organic Apples" serverVersion={3} />
      </>,
    )
    fireEvent.click(screen.getByTestId('enter'))
    expect(screen.getByTestId('table-name').textContent).toBe('QA name')
    expect(screen.getByTestId('detail-name').textContent).toBe('QA name')
    rerender(
      <>
        <TableName serverText="Organic Apples" serverVersion={3} />
        <DetailName serverText="Apples" serverVersion={2} />
      </>,
    )
    expect(screen.getByTestId('table-name').textContent).toBe('QA name')
    expect(screen.getByTestId('detail-name').textContent).toBe('QA name')
  })
})
