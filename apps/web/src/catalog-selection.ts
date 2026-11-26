export type CatalogPick = {
  key: string
  kind: 'master' | 'source'
}

let current: CatalogPick | null = null
const listeners = new Set<() => void>()

export function catalogSelection(): CatalogPick | null {
  return current
}

export function setCatalogSelection(next: CatalogPick | null) {
  const same = current?.key === next?.key && current?.kind === next?.kind
  if (same && (current !== null) === (next !== null)) return
  current = next
  for (const listen of listeners) listen()
}

export function subscribeCatalogSelection(listen: () => void) {
  listeners.add(listen)
  return () => {
    listeners.delete(listen)
  }
}

/** The row Ctrl+K should act on. An empty selection is not the first row. */
export function selectedCatalogRow<T extends { id: string }>(
  rows: readonly T[],
  activeId: string | null,
): T | null {
  if (!activeId) return null
  return rows.find((row) => row.id === activeId) ?? null
}

/** Delete catalog is offered only when a catalog row is selected. */
export function catalogDeleteAvailable(pick: { key: string } | null): boolean {
  return Boolean(pick?.key)
}
