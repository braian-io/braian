// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FieldsMode } from './fields-mode'
import { makeViewColumn, type ViewColumn } from './columns'
import type { FieldDef } from './qualifiers'

const fields: FieldDef[] = [
  {
    id: 'fat_content',
    name: 'Fat content',
    typeLabel: 'number',
    shape: 'unit',
    units: ['g', 'kg'],
    source: 'Dairy & eggs',
  },
  {
    id: 'fat_content.value',
    name: 'Fat content (value)',
    typeLabel: 'number',
    shape: 'number',
    source: 'Dairy & eggs',
  },
  {
    id: 'fat_content.unit',
    name: 'Fat content (unit)',
    typeLabel: 'text',
    shape: 'text',
    source: 'Dairy & eggs',
  },
]

function columns(): ViewColumn[] {
  return [
    makeViewColumn(['fat_content'], [{ kind: 'unit', optionId: 'kg', label: 'kg' }], fields)!,
    makeViewColumn(['fat_content.value'], [], fields)!,
    makeViewColumn(['fat_content.unit'], [], fields)!,
  ]
}

afterEach(() => {
  cleanup()
})

function renderFields() {
  render(
    <FieldsMode
      open={{ kind: 'browse' }}
      columns={columns()}
      fields={fields}
      onClose={() => undefined}
      onToggleColumn={() => undefined}
      onShowColumn={() => undefined}
      onReplaceColumn={() => undefined}
      peerOptionsForField={() => []}
    />,
  )
}

describe('FieldsMode measured parts', () => {
  it('lists the combined field and both value and unit columns together', () => {
    renderFields()
    expect(screen.getByTestId('fields-row-fat_content').textContent).toContain('Fat content')
    expect(screen.getByTestId('fields-row-fat_content.value').textContent).toContain('Fat content (value)')
    expect(screen.getByTestId('fields-row-fat_content.unit').textContent).toContain('Fat content (unit)')
    expect(screen.getByTestId('fields-check-fat_content').getAttribute('data-state')).toBe('checked')
    expect(screen.getByTestId('fields-check-fat_content.value').getAttribute('data-state')).toBe('checked')
    expect(screen.getByTestId('fields-check-fat_content.unit').getAttribute('data-state')).toBe('checked')
  })

  it('finds the parts by the group name', () => {
    renderFields()
    fireEvent.change(screen.getByTestId('fields-mode-input'), { target: { value: 'dairy' } })
    expect(screen.getByTestId('fields-row-fat_content.value')).toBeTruthy()
    expect(screen.getByTestId('fields-row-fat_content.unit')).toBeTruthy()
  })
})
