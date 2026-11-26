import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCatalogsQuery, type CatalogListRow } from '../catalog-list'
import { ApiError } from '../api'
import { copy } from '../i18n'
import { registerCommandRunner } from '../command-registry'
import { onDraftChange, requestReview, stageModelSteps } from '../model-stage'
import { commitModelSteps } from '../model-commit'
import { reportWriteError } from '../write-error'
import { StateNote } from '../states'
import {
  StandardEditableTable,
  type EditRequest,
  type StandardColumn,
} from '../standard-editable-table'
import { attributeKey } from '../model-view'

export type CatalogTableRow = {
  id: string
  key: string
  name: string
  kind: 'master' | 'source'
  editable: boolean
}

function rowFromApi(row: CatalogListRow): CatalogTableRow | null {
  const id = row.id ?? row.key ?? ''
  const key = row.key ?? ''
  if (!id || !key) return null
  const kind = row.kind === 'master' ? 'master' : 'source'
  return {
    id,
    key,
    name: row.name ?? key,
    kind,
    editable: row.kind === 'master' ? false : row.editable !== false,
  }
}

function kindLabel(kind: CatalogTableRow['kind']) {
  return kind === 'master' ? copy.catalogKindMaster : copy.catalogKindSource
}

function upsertStep(row: CatalogTableRow, renamedFrom?: string) {
  return {
    op: 'upsert_catalog' as const,
    catalog: {
      key: row.key.trim(),
      ...(renamedFrom ? { renamed_from: renamedFrom } : {}),
      name: row.name.trim() || row.key.trim(),
      kind: row.kind,
      editable: row.editable,
    },
  }
}

export function CatalogsTable() {
  const queryClient = useQueryClient()
  const listed = useCatalogsQuery()
  const [filter, setFilter] = useState('')
  const [draftRows, setDraftRows] = useState<Record<string, CatalogTableRow>>({})
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null)
  const [message, setMessage] = useState('')
  const [nextNew, setNextNew] = useState(0)
  const rowsRef = useRef<CatalogTableRow[]>([])
  const activeIdRef = useRef<string | null>(null)

  useEffect(() => onDraftChange(() => {
    void queryClient.invalidateQueries({ queryKey: ['catalogs'] })
  }), [queryClient])

  const rows = useMemo(() => {
    return (listed.data ?? [])
      .map(rowFromApi)
      .filter((row): row is CatalogTableRow => row != null)
      .sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key))
  }, [listed.data])

  const displayRows = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]))
    for (const [id, draftRow] of Object.entries(draftRows)) {
      if (!byId.has(id)) byId.set(id, draftRow)
    }
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key))
  }, [rows, draftRows])

  rowsRef.current = displayRows
  activeIdRef.current = activeRowId

  const isPersisted = (row: CatalogTableRow) => rows.some((item) => item.id === row.id)
  const isNew = (row: CatalogTableRow) => row.id.startsWith('catalog-new-') || !isPersisted(row)

  const runAction = async (action: 'new' | 'rename' | 'delete' | 'infer' | 'cleanup') => {
    const row =
      rowsRef.current.find((item) => item.id === activeIdRef.current) ??
      rowsRef.current[0]
    if (action === 'new') {
      const id = `catalog-new-${nextNew}`
      setNextNew((value) => value + 1)
      const draft: CatalogTableRow = { id, key: '', name: '', kind: 'source', editable: true }
      setDraftRows((current) => ({ ...current, [id]: draft }))
      setActiveRowId(id)
      queueMicrotask(() => setEditRequest({ rowId: id, columnId: 'key' }))
      return
    }
    if (!row) return
    if (action === 'rename') {
      setActiveRowId(row.id)
      queueMicrotask(() => setEditRequest({ rowId: row.id, columnId: 'name' }))
      return
    }
    if (action === 'delete') {
      if (row.kind === 'master' || !row.key) return
      setMessage('')
      try {
        await stageModelSteps([{ op: 'delete_catalog', key: row.key }])
        await requestReview()
      } catch (reason: unknown) {
        reportWriteError(reason)
      }
      return
    }
    if (action === 'infer' || action === 'cleanup') {
      if (row.kind !== 'source' || !row.key) return
      setMessage('')
      try {
        const path = action === 'infer'
          ? `/v1/catalogs/${encodeURIComponent(row.key)}/infer`
          : `/v1/catalogs/${encodeURIComponent(row.key)}/cleanup`
        const response = await fetch(path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(action === 'infer' ? { headers: [] } : {}),
        })
        if (!response.ok) {
          const text = await response.text()
          throw new ApiError(response.status, text || response.statusText, null)
        }
        void queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      } catch (reason: unknown) {
        const detail = reason instanceof ApiError ? reason.message : ''
        setMessage(detail || (action === 'infer' ? copy.inferModelFailed : copy.cleanupCatalogFailed))
        reportWriteError(reason)
      }
    }
  }

  const runRef = useRef(runAction)
  runRef.current = runAction
  useEffect(() => {
    const stops = [
      registerCommandRunner('catalog:new', () => { void runRef.current('new') }),
      registerCommandRunner('catalog:rename', () => { void runRef.current('rename') }),
      registerCommandRunner('catalog:delete', () => { void runRef.current('delete') }),
      registerCommandRunner('catalog:infer', () => { void runRef.current('infer') }),
      registerCommandRunner('catalog:cleanup', () => { void runRef.current('cleanup') }),
    ]
    return () => stops.forEach((stop) => stop())
  }, [])

  const columns: Array<StandardColumn<CatalogTableRow>> = [
    {
      id: 'name',
      header: copy.catalogName,
      editable: true,
      truncate: true,
      read: (row) => row.name,
      write: (row, value) => ({ ...row, name: value }),
    },
    {
      id: 'key',
      header: copy.catalogKey,
      headerTitle: copy.catalogKeyHint,
      editable: true,
      truncate: true,
      read: (row) => row.key,
      write: (row, value) => ({ ...row, key: attributeKey(value) }),
      display: (row) => row.key || '—',
    },
    {
      id: 'kind',
      header: copy.catalogKind,
      type: 'readonly',
      editable: false,
      read: (row) => kindLabel(row.kind),
    },
    {
      id: 'editable',
      header: copy.catalogEditable,
      headerTitle: copy.catalogEditableHint,
      type: 'boolean',
      display: 'checkbox',
      editable: true,
      read: (row) => row.editable,
      write: (row, value) => ({ ...row, editable: value === 'true' }),
    },
  ]

  if (listed.isPending) {
    return (
      <div data-testid="catalogs-table">
        <StateNote tone="loading" title={copy.loading} />
      </div>
    )
  }
  if (listed.isError) {
    return (
      <div data-testid="catalogs-table">
        <StateNote tone="error" title={copy.catalogCreateFailed} />
      </div>
    )
  }

  return (
    <div data-testid="catalogs-table">
      {message ? <StateNote tone="error" title={message} /> : null}
      <StandardEditableTable
        testId="catalogs-table-chrome"
        columns={columns}
        rows={displayRows}
        draftRows={draftRows}
        onDraftRowsChange={setDraftRows}
        onNewRow={() => { void runAction('new') }}
        newRowLabel={copy.newCatalog}
        filterValue={filter}
        onFilterChange={(value) => {
          setFilter(value)
          setActiveRowId(null)
        }}
        activeRowId={activeRowId}
        onActivateRow={(row) => setActiveRowId(row.id)}
        getRowTestId={() => 'catalog-row'}
        getRowKeyAttr={(row) => row.key || row.id}
        canEdit={(row, column) => {
          if (row.kind === 'master' && column.id === 'editable') return false
          if (column.id === 'key' && isPersisted(row)) return false
          if (column.id === 'kind') return false
          return true
        }}
        menuContext={(row) => (row?.key ? 'model-catalog' : 'model')}
        getMenuTarget={(row) => ({
          catalogKey: row?.key || undefined,
          catalogKind: row?.kind,
        })}
        editRequest={editRequest}
        onEditRequestHandled={() => setEditRequest(null)}
        saveCell={async (row) => {
          setMessage('')
          if (isNew(row)) {
            const key = row.key.trim() || attributeKey(row.name)
            if (!key) return
            await commitModelSteps(queryClient, [upsertStep({ ...row, key, name: row.name.trim() || key })])
          } else {
            const stored = rows.find((item) => item.id === row.id)
            if (!stored) return
            if (row.key !== stored.key) throw new Error(copy.catalogKeyLocked)
            await commitModelSteps(queryClient, [upsertStep(row)])
          }
          setDraftRows((current) => {
            const next = { ...current }
            delete next[row.id]
            return next
          })
        }}
      />
    </div>
  )
}