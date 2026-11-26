import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/client'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { formatTimestamp } from '../format'
import { copy } from '../i18n'
import { StandardEditableTable, type StandardColumn } from '../standard-editable-table'

type Saved = {
  id: string
  name: string
  type: string
  headers: unknown
  columns: unknown
  empty_clears: boolean
  created_by?: string
  updated_at?: string
  can_edit?: boolean
}

function sourceSummary(row: Saved) {
  const headers = Array.isArray(row.headers) ? row.headers.map((header) => String(header ?? '')).filter(Boolean) : []
  const count = Array.isArray(row.columns) ? row.columns.length : 0
  const shown = headers.slice(0, 4).join(', ')
  const extra = headers.length > 4 ? ` +${headers.length - 4}` : ''
  const mapped = count === 1 ? '1 column' : `${count} columns`
  return shown ? `${shown}${extra} · ${mapped}` : mapped
}

function canChange(row: Saved) {
  return row.can_edit !== false
}

/** Saved import mappings: shared by everyone, listed here so they can be renamed or deleted. */
export function ImportMappingsView() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Saved>>({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Saved | null>(null)
  const list = useQuery({ queryKey: ['import-mappings'], queryFn: () => api.get('/v1/import-mappings') })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['import-mappings'] })
  const rename = useMutation({
    mutationFn: (item: { id: string; name: string }) =>
      api.patch('/v1/import-mappings/{id}', { params: { path: { id: item.id } }, body: { name: item.name } }),
    onSuccess: () => {
      setError('')
      void refresh()
    },
    onError: (reason: unknown) => setError(reason instanceof Error ? reason.message : 'Rename failed'),
    onSettled: (_data, _error, item) =>
      setDrafts((current) => {
        const { [item.id]: _removed, ...rest } = current
        return rest
      }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.del('/v1/import-mappings/{id}', { params: { path: { id } } }),
    onSuccess: () => {
      setError('')
      setPending(null)
      void refresh()
    },
    onError: (reason: unknown) => setError(reason instanceof Error ? reason.message : 'Delete failed'),
  })
  const all = (list.data?.mappings ?? []) as Saved[]
  const columns: Array<StandardColumn<Saved>> = [
    {
      id: 'name',
      header: copy.name,
      type: 'text',
      truncate: true,
      read: (row) => row.name,
      write: (row, value) => ({ ...row, name: value }),
      validate: (value) => (value.trim() ? undefined : 'Give the mapping a name.'),
    },
    {
      id: 'source',
      header: copy.importMappingSource,
      type: 'readonly',
      truncate: true,
      read: (row) => sourceSummary(row),
    },
    { id: 'type', header: copy.importObjectType, type: 'readonly', truncate: true, read: (row) => row.type },
    {
      id: 'created_by',
      header: copy.createdBy,
      type: 'readonly',
      truncate: true,
      read: (row) => row.created_by ?? '',
    },
    {
      id: 'updated',
      header: copy.updated,
      type: 'readonly',
      width: 150,
      read: (row) => (row.updated_at ? formatTimestamp(row.updated_at) : ''),
    },
  ]
  if (all.some(canChange)) {
    columns.push({
      id: 'delete',
      header: copy.delete,
      type: 'readonly',
      width: 90,
      read: () => '',
      display: (row) => canChange(row) ? (
        <Button
          type="button"
          variant="danger"
          aria-label={`${copy.delete} ${row.name}`}
          onClick={(event) => {
            event.stopPropagation()
            setError('')
            setPending(row)
          }}
        >
          {copy.delete}
        </Button>
      ) : null,
    })
  }
  // A cell edit is persisted when the editor closes. The draft only bridges until the refetch.
  const onDraftRowsChange = (next: Record<string, Saved>) => {
    for (const [id, row] of Object.entries(next)) {
      const original = all.find((item) => item.id === id)
      const name = row.name.trim()
      if (!original || !canChange(original) || !name || name === original.name || drafts[id]?.name === row.name) continue
      rename.mutate({ id, name })
    }
    setDrafts(next)
  }
  return (
    <>
      {error && !pending ? <p className="error" role="alert">{error}</p> : null}
      <StandardEditableTable<Saved>
        testId="import-mappings"
        columns={columns}
        rows={all}
        draftRows={drafts}
        onDraftRowsChange={onDraftRowsChange}
        filterValue={filter}
        onFilterChange={(value) => {
          setFilter(value)
          setActiveRowId(null)
        }}
        activeRowId={activeRowId}
        onActivateRow={(row) => setActiveRowId(row.id)}
        canEdit={(row, column) => column.id !== 'name' || canChange(row)}
        getRowTestId={(row) => `import-mapping-${row.id}`}
        emptyLabel={copy.importNoSavedMappings}
      />
      <Dialog open={Boolean(pending)} onOpenChange={(next) => { if (!next && !remove.isPending) setPending(null) }}>
        <DialogContent data-testid="import-mapping-delete">
          <DialogTitle>{copy.importDeleteMapping}</DialogTitle>
          <DialogDescription>
            {copy.importDeleteMappingBody.replace('{name}', pending?.name ?? '')}
          </DialogDescription>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button type="button" variant="default" disabled={remove.isPending} onClick={() => setPending(null)}>
              {copy.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              data-testid="confirm-delete-mapping"
              disabled={remove.isPending || !pending}
              onClick={() => {
                if (pending) remove.mutate(pending.id)
              }}
            >
              {copy.delete}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
