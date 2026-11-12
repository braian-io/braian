// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FieldsMode } from './fields-mode'
import type { FieldDef } from './qualifiers'

const fields: FieldDef[] = [
  { id: 'fat_content', name: 'Fat content', typeLabel: 'number', shape: 'number', source: 'Dairy & eggs' },
  { id: 'caffeine', name: 'Caffeine', typeLabel: 'number', shape: 'number', source: 'Coffee & tea' },
  { id: 'sku', name: 'SKU', typeLabel: 'text', shape: 'text' },
]

afterEach(() => {
  cleanup()
})

function renderFields() {
  render(
    <FieldsMode
      open={{ kind: 'browse' }}
      columns={[]}
      fields={fields}
      onClose={() => undefined}
      onToggleColumn={() => undefined}
      onShowColumn={() => undefined}
      onReplaceColumn={() => undefined}
      peerOptionsForField={() => []}
    />,
  )
}

describe('FieldsMode structure sources', () => {
  it('shows the group name as the subtitle for group-sourced fields', () => {
    renderFields()
    expect(screen.getByTestId('fields-row-fat_content').textContent).toContain('Dairy & eggs')
    expect(screen.getByTestId('fields-row-caffeine').textContent).toContain('Coffee & tea')
    expect(screen.getByTestId('fields-row-sku').textContent).not.toContain('Dairy & eggs')
  })

  it('finds a group-sourced field by typing its group name', () => {
    renderFields()
    fireEvent.change(screen.getByTestId('fields-mode-input'), { target: { value: 'dairy' } })
    expect(screen.getByTestId('fields-row-fat_content')).toBeTruthy()
    expect(screen.queryByTestId('fields-row-caffeine')).toBeNull()
    expect(screen.queryByTestId('fields-row-sku')).toBeNull()

    fireEvent.change(screen.getByTestId('fields-mode-input'), { target: { value: 'coffee' } })
    expect(screen.getByTestId('fields-row-caffeine')).toBeTruthy()
    expect(screen.queryByTestId('fields-row-fat_content')).toBeNull()
  })
})
