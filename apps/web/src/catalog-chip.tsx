import { useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { copy } from './i18n'

type CatalogRow = { key?: string; name?: string; kind?: string }

/** Shows the view's catalog and writes a new one through `braian-set-catalog`. */
export function CatalogChip({ viewId, catalog }: { viewId: string; catalog: string }) {
  const catalogs = useQuery({
    queryKey: ['catalogs'],
    queryFn: async () => {
      const response = await fetch('/v1/catalogs', { credentials: 'include' })
      if (!response.ok) return [] as CatalogRow[]
      return (await response.json()) as CatalogRow[]
    },
    staleTime: 30_000,
  })
  const rows = Array.isArray(catalogs.data) ? catalogs.data : []
  const options = rows.length > 0 ? rows : [{ key: 'master', name: copy.masterCatalog, kind: 'master' }]
  const current = options.find((row) => row.key === catalog)
  const value = current?.key || 'master'
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        window.dispatchEvent(
          new CustomEvent('braian-set-catalog', {
            detail: { viewId, catalog: next },
          }),
        )
      }}
    >
      <SelectTrigger
        className="catalog-chip"
        data-testid="catalog-chip"
        data-kind={current?.kind ?? 'master'}
        aria-label={copy.catalog}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((row) => (
          <SelectItem key={row.key} value={row.key || 'master'}>
            {row.name || row.key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
