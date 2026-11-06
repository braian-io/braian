import { Check } from 'lucide-react'
import { useRef } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
import { MASTER_CATALOG_ID } from './catalog-ref'
import { useCatalogsQuery, type CatalogListRow } from './catalog-list'
import { copy } from './i18n'

function withMaster(rows: CatalogListRow[]): CatalogListRow[] {
  if (rows.some((row) => row.id === MASTER_CATALOG_ID || row.key === 'master')) return rows
  return [{ id: MASTER_CATALOG_ID, key: 'master', name: copy.masterCatalog, kind: 'master' }, ...rows]
}

/** The header label must never guess another catalog while names are loading. */
export function catalogSelectorLabel(rows: CatalogListRow[], catalogId: string): string {
  const options = rows.length > 0 ? withMaster(rows) : [{ id: MASTER_CATALOG_ID, key: 'master', name: copy.masterCatalog, kind: 'master' }]
  const current = options.find((row) => row.id === catalogId)
  if (current?.name) return current.name
  if (current?.key) return current.key
  return catalogId === MASTER_CATALOG_ID ? copy.masterCatalog : copy.catalog
}

/** Discreet workspace catalog switcher for the app header (Notion 117 follow-up). */
export function CatalogSelector({
  catalogId,
  onSelect,
  disabled,
}: {
  catalogId: string
  onSelect: (catalogId: string) => void
  disabled?: boolean
}) {
  const catalogs = useCatalogsQuery()
  const rows = Array.isArray(catalogs.data) ? catalogs.data : []
  const options = rows.length > 0
    ? withMaster(rows)
    : [{ id: MASTER_CATALOG_ID, key: 'master', name: copy.masterCatalog, kind: 'master' }]
  const current = options.find((row) => row.id === catalogId)
  const label = catalogSelectorLabel(rows, catalogId)
  const currentId = current?.id ?? catalogId
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={trigger}
          type="button"
          className="catalog-selector-btn"
          data-testid="catalog-selector"
          data-kind={current?.kind ?? 'master'}
          aria-label={copy.switchCatalog}
          disabled={disabled}
        >
          <span className="catalog-selector-label">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="user-menu-content catalog-selector-menu"
        collisionPadding={8}
        data-testid="catalog-selector-menu"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          trigger.current?.focus()
        }}
      >
        {options.map((row) => {
          const id = row.id || MASTER_CATALOG_ID
          const selected = id === currentId
          return (
            <DropdownMenuItem
              key={id}
              data-testid={`catalog-option-${row.key || id}`}
              onSelect={() => {
                if (!selected) onSelect(id)
              }}
            >
              <span className="catalog-selector-item-label">{row.name || row.key || id}</span>
              {selected ? <Check className="menu-icon catalog-selector-check" aria-hidden="true" size={14} /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
