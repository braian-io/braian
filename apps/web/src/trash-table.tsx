import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { formatTimestamp } from './format'
import { copy } from './i18n'
import { clearObjectGone } from './object-gone'
import { registerCommandRunner } from './command-registry'
import { publishTrashActive } from './ui-context'
import { StandardEditableTable, type StandardColumn } from './standard-editable-table'
import { writeErrorMessage } from './write-error'
import { TrashPurgeDialog } from './trash-purge-dialog'

export type TrashRow = {
  id: string
  kind: string
  number: string
  name: string
  typeKey: string
  deletedAt: string
}

export type TrashTableProps = {
  onOpenObject?: (id: string) => void
}

function typeLabel(row: TrashRow) {
  if (row.kind === 'object' && row.typeKey) return row.typeKey
  return copy.trashKind[row.kind] ?? row.kind
}

export function TrashTable({ onOpenObject }: TrashTableProps) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<TrashRow | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  const rowsRef = useRef<TrashRow[]>([])
  const activeIdRef = useRef<string | null>(null)

  const listed = useQuery({
    queryKey: ['trash'],
    queryFn: () => api.get('/v1/trash'),
  })

  const rows = useMemo((): TrashRow[] => {
    return (listed.data?.items ?? []).map((item) => {
      const row = item as typeof item & { number?: string; type_key?: string }
      return {
        id: row.id,
        kind: row.kind,
        number: row.number ?? '',
        name: row.label,
        typeKey: row.type_key ?? '',
        deletedAt: formatTimestamp(row.deleted_at),
      }
    })
  }, [listed.data])

  rowsRef.current = rows
  activeIdRef.current = activeRowId

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['trash'] })
    void queryClient.invalidateQueries({ queryKey: ['objects'] })
    void queryClient.invalidateQueries({ queryKey: ['search'] })
  }

  const flash = (message: string, error = false) => {
    setNoticeError(error)
    setNotice(message)
    window.setTimeout(() => setNotice(''), 5000)
  }

  const restore = useMutation({
    mutationFn: (row: TrashRow) => api.post('/v1/trash/{kind}/{id}/undelete', {
      params: { path: { kind: row.kind, id: row.id } },
    }),
    onSuccess: (_data, row) => {
      if (row.kind === 'object') clearObjectGone(queryClient, row.id)
      flash(copy.trashRestored)
      invalidate()
    },
    onError: (error) => flash(writeErrorMessage(error) ?? copy.trashRestoreFailed, true),
  })

  const purge = useMutation({
    mutationFn: (row: TrashRow) => api.post('/v1/trash/{kind}/{id}/purge', {
      params: { path: { kind: row.kind, id: row.id } },
    }),
    onSuccess: (_data, row) => {
      if (row.kind === 'object') clearObjectGone(queryClient, row.id)
      flash(copy.trashPurged)
      setPurgeTarget(null)
      setActiveRowId((current) => (current === row.id ? null : current))
      invalidate()
    },
    onError: (error) => flash(writeErrorMessage(error) ?? copy.trashPurgeFailed, true),
  })

  const activeRow = () =>
    rowsRef.current.find((row) => row.id === activeIdRef.current) ?? null

  const runAction = (action: 'restore' | 'purge') => {
    const row = activeRow()
    if (!row) return
    if (action === 'restore') restore.mutate(row)
    else setPurgeTarget(row)
  }

  const runRef = useRef(runAction)
  runRef.current = runAction
  useEffect(() => {
    const stops = [
      registerCommandRunner('trash:restore', () => runRef.current('restore')),
      registerCommandRunner('trash:purge', () => runRef.current('purge')),
    ]
    return () => stops.forEach((stop) => stop())
  }, [])

  useEffect(() => {
    const row = activeRowId ? rows.find((item) => item.id === activeRowId) : null
    publishTrashActive(row ? { kind: row.kind, id: row.id, name: row.name } : null)
    return () => publishTrashActive(null)
  }, [activeRowId, rows])

  const columns: Array<StandardColumn<TrashRow>> = [
    {
      id: 'number',
      header: copy.trashColumnNumber,
      type: 'readonly',
      read: (row) => row.number || '—',
      title: (row) => row.number || '',
    },
    {
      id: 'name',
      header: copy.trashColumnName,
      type: 'readonly',
      truncate: true,
      read: (row) => row.name,
      title: (row) => row.name,
    },
    {
      id: 'type',
      header: copy.trashColumnType,
      type: 'readonly',
      width: 140,
      read: (row) => typeLabel(row),
    },
    {
      id: 'deleted',
      header: copy.trashColumnDeleted,
      type: 'readonly',
      width: 168,
      read: (row) => row.deletedAt,
    },
  ]

  return (
    <div data-testid="trash-table">
      {notice ? (
        <p
          className={noticeError ? 'error' : 'inline-hint'}
          role="status"
          data-testid="trash-inline-notice"
        >
          {notice}
        </p>
      ) : null}
      <StandardEditableTable
        testId="trash-table-chrome"
        columns={columns}
        rows={rows}
        editable={false}
        loading={listed.isPending}
        emptyLabel={copy.trashEmpty}
        filterValue={filter}
        onFilterChange={(value) => {
          setFilter(value)
          setActiveRowId(null)
        }}
        rowFilterText={(row) => `${row.name} ${row.number} ${row.typeKey} ${row.kind} ${row.id}`}
        activeRowId={activeRowId}
        onActivateRow={(row) => {
          setActiveRowId(row.id)
          if (row.kind !== 'object') return
          // Show the trash label before the allow_deleted read returns.
          queryClient.setQueryData(['object', row.id, 'deleted'], {
            id: row.id,
            key: row.number || row.name,
            type: row.typeKey,
            version: 0,
            values: {
              number: row.number || row.name,
              name: { en: row.name },
            },
            links: [],
          })
          onOpenObject?.(row.id)
        }}
        getRowTestId={() => 'trash-row'}
        getRowKeyAttr={(row) => row.id}
        menuContext={() => 'trash'}
        getMenuTarget={(row) => ({
          trashKind: row?.kind,
          trashLabel: row?.name,
          objectId: row?.kind === 'object' ? row.id : undefined,
        })}
      />
      <TrashPurgeDialog
        target={purgeTarget}
        busy={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => { if (purgeTarget) purge.mutate(purgeTarget) }}
      />
    </div>
  )
}