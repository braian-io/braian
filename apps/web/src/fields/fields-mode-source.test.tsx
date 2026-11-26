// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FieldsMode } from './fields-mode'
import type { FieldDef } from './qualifiers'

const fields: FieldDef[] = [
  {
    id: 'fat_content',
    name: 'Fat content',
    typeLabel: 'number',
    shape: 'number',
    source: 'Food › Dairy & eggs',
  },
  {
    id: 'caffeine',
    name: 'Caffeine',
    typeLabel: 'number',
    shape: 'number',
    source: 'Food › Beverages › Coffee & tea',
  },
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
  it('shows the type label and full group path for group-sourced fields', () => {
    renderFields()
    const fat = screen.getByTestId('fields-row-fat_content')
    expect(fat.textContent).toContain('number')
    expect(fat.textContent).toContain('Food › Dairy & eggs')
    const caffeine = screen.getByTestId('fields-row-caffeine')
    expect(caffeine.textContent).toContain('number')
    expect(caffeine.textContent).toContain('Food › Beverages › Coffee & tea')
    expect(screen.getByTestId('fields-row-sku').textContent).toContain('text')
    expect(screen.getByTestId('fields-row-sku').textContent).not.toContain('Food ›')
  })

  it('finds a group-sourced field by typing an ancestor group name', () => {
    renderFields()
    fireEvent.change(screen.getByTestId('fields-mode-input'), { target: { value: 'dairy' } })
    expect(screen.getByTestId('fields-row-fat_content')).toBeTruthy()
    expect(screen.queryByTestId('fields-row-caffeine')).toBeNull()
    expect(screen.queryByTestId('fields-row-sku')).toBeNull()

    fireEvent.change(screen.getByTestId('fields-mode-input'), { target: { value: 'beverages' } })
    expect(screen.getByTestId('fields-row-caffeine')).toBeTruthy()
    expect(screen.queryByTestId('fields-row-fat_content')).toBeNull()
  })
})