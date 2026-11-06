// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CatalogSelector, catalogSelectorLabel } from './catalog-selector'
import { MASTER_CATALOG_ID } from './catalog-ref'
import { copy } from './i18n'

afterEach(() => {
  cleanup()
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['catalogs'], [
    { id: MASTER_CATALOG_ID, key: 'master', name: 'Master catalog', kind: 'master' },
    { id: 'catalog-sap', key: 'sap', name: 'SAP ERP', kind: 'source' },
  ])
  render(
    <QueryClientProvider client={client}>
      <CatalogSelector catalogId={MASTER_CATALOG_ID} onSelect={() => undefined} />
    </QueryClientProvider>,
  )
  return screen.getByTestId('catalog-selector')
}

it('closes on Escape and returns focus to the trigger', async () => {
  const trigger = mount()
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
  const menu = await screen.findByTestId('catalog-selector-menu')
  expect(menu).toBeTruthy()

  fireEvent.keyDown(menu, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByTestId('catalog-selector-menu')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})

it('never shows another catalog name while names are loading', () => {
  expect(catalogSelectorLabel([], MASTER_CATALOG_ID)).toBe(copy.masterCatalog)
  expect(catalogSelectorLabel([], 'catalog-sap')).toBe(copy.catalog)
  expect(catalogSelectorLabel([{ id: MASTER_CATALOG_ID, key: 'master', name: 'Master catalog', kind: 'master' }], 'catalog-sap'))
    .toBe(copy.catalog)
})
