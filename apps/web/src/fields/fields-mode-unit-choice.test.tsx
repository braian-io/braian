// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldsMode } from './fields-mode'
import { makeViewColumn } from './columns'
import type { FieldDef } from './qualifiers'

const protein: FieldDef = {
  id: 'protein',
  name: 'Protein',
  typeLabel: 'number',
  shape: 'unit',
  units: ['g', 'kg'],
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FieldsMode unit display choice', () => {
  it('shows radio inputs and only one unit checked at a time', () => {
    const gCol = makeViewColumn(['protein'], [{ kind: 'unit', optionId: 'g', label: 'g' }], [protein])
    expect(gCol).toBeTruthy()
    render(
      <FieldsMode
        open={{ kind: 'browse' }}
        columns={[gCol!]}
        fields={[protein]}
        onClose={() => undefined}
        onToggleColumn={() => undefined}
        onShowColumn={() => undefined}
        onReplaceColumn={() => undefined}
        peerOptionsForField={() => []}
      />,
    )
    fireEvent.click(screen.getByTestId('fields-row-protein'))
    expect(screen.getByTestId('fields-check-g').getAttribute('data-choice')).toBe('radio')
    expect(screen.getByTestId('fields-check-kg').getAttribute('data-choice')).toBe('radio')
    expect(screen.getByTestId('fields-check-g').getAttribute('data-state')).toBe('checked')
    expect(screen.getByTestId('fields-check-kg').getAttribute('data-state')).toBe('unchecked')
  })

  it('replaces the column when picking a different unit', () => {
    const gCol = makeViewColumn(['protein'], [{ kind: 'unit', optionId: 'g', label: 'g' }], [protein])
    expect(gCol).toBeTruthy()
    const onReplaceColumn = vi.fn()
    const onToggleColumn = vi.fn()
    render(
      <FieldsMode
        open={{ kind: 'browse' }}
        columns={[gCol!]}
        fields={[protein]}
        onClose={() => undefined}
        onToggleColumn={onToggleColumn}
        onShowColumn={() => undefined}
        onReplaceColumn={onReplaceColumn}
        peerOptionsForField={() => []}
      />,
    )
    fireEvent.click(screen.getByTestId('fields-row-protein'))
    fireEvent.click(screen.getByTestId('fields-row-kg'))
    expect(onReplaceColumn).toHaveBeenCalledTimes(1)
    expect(onToggleColumn).not.toHaveBeenCalled()
    const kgCol = makeViewColumn(['protein'], [{ kind: 'unit', optionId: 'kg', label: 'kg' }], [protein])
    expect(onReplaceColumn.mock.calls[0]?.[0]).toBe(gCol!.id)
    expect(onReplaceColumn.mock.calls[0]?.[1]?.id).toBe(kgCol!.id)
  })

  it('toggles off when picking the active unit again', () => {
    const gCol = makeViewColumn(['protein'], [{ kind: 'unit', optionId: 'g', label: 'g' }], [protein])
    expect(gCol).toBeTruthy()
    const onToggleColumn = vi.fn()
    render(
      <FieldsMode
        open={{ kind: 'browse' }}
        columns={[gCol!]}
        fields={[protein]}
        onClose={() => undefined}
        onToggleColumn={onToggleColumn}
        onShowColumn={() => undefined}
        onReplaceColumn={() => undefined}
        peerOptionsForField={() => []}
      />,
    )
    fireEvent.click(screen.getByTestId('fields-row-protein'))
    fireEvent.click(screen.getByTestId('fields-row-g'))
    expect(onToggleColumn).toHaveBeenCalledTimes(1)
  })
})