// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  { id: 'sku', name: 'SKU', typeLabel: 'text', shape: 'text' },
]

function stylesPath() {
  const candidates = [join(process.cwd(), 'src/styles.css'), join(process.cwd(), 'apps/web/src/styles.css')]
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new Error('styles.css not found')
  return found
}

const css = readFileSync(stylesPath(), 'utf8')

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

describe('field picker list height', () => {
  it('styles field-picker rows to grow past the default palette hit height', () => {
    expect(css).toMatch(/\[data-picker-mode\] \.hit\s*\{[^}]*height:\s*auto/)
    expect(css).toMatch(/\[data-picker-mode\] \.hit\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\[data-picker-mode\] \.hit \.hit-copy\s*\{[^}]*overflow:\s*visible/)
    expect(css).toMatch(/\[cmdk-list-sizer\]\s*\{[^}]*min-height:\s*min-content/)
  })

  it('shows the full single search hit without hiding group metadata', () => {
    renderFields()
    fireEvent.change(screen.getByTestId('fields-mode-input'), { target: { value: 'fat co' } })
    const row = screen.getByTestId('fields-row-fat_content')
    expect(screen.queryByTestId('fields-row-sku')).toBeNull()
    expect(row.textContent).toContain('Fat content')
    expect(row.textContent).toContain('number')
    expect(row.textContent).toContain('Food › Dairy & eggs')
  })
})