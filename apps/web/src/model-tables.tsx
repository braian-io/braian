import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, textValue, type Json } from './api'
import { CreateDialog, requireText } from './create-dialog'
import { copy, uiLanguage } from './i18n'
import { attributeKey, objectTypes } from './model-view'
import { onDraftChange, setModelFocus, stageModel, stageModelSteps } from './model-stage'
import { buildLinkTypeCreateSteps, buildLinkTypeUpdateSteps } from './link-type-table-steps'
import {
  clearStoredLinkTypesTableDraft,
  readStoredLinkTypesTableDraft,
  restoreLinkTypesTableDraft,
  serializeLinkTypeDraftRow,
  writeStoredLinkTypesTableDraft,
} from './link-type-table-draft-persist'
import { entityTypeKeys, linkTypeRows, type LinkTypeRow } from './link-type-view'
import { registerModelTableDraft } from './model-table-draft'
import type { ModelTableDraftScope } from './data-model'
import { typeNames } from './type-labels'
import { StandardEditableTable, type StandardColumn } from './standard-editable-table'
import { getModelSelection, subscribeModelSelection } from './model-selection'
import { tryChooseModelSelection } from './model-table-draft'
import { clearPendingModelType, OPEN_MODEL_TYPE, peekPendingModelType } from './model-type-open'
import { StateNote } from './states'

type TypeRow = {
  id: string
  key: string
  label: string
  singular: string
  plural: string
  kind: string
}

type ListRow = { id: string; key: string; label: string; optionCount: number }
type OptionRow = { id: string; code: string; label: string; listKey: string }
type UnitRow = { id: string; family: string; code: string; factor: string }

export function valueListOptions(defs: Json | undefined, listKey: string): OptionRow[] {
  const list = ((defs?.value_lists as Json[] | undefined) ?? []).find((item) => String(item.key) === listKey)
  if (!list) return []
  return ((list.options as Json[] | undefined) ?? []).map((option) => {
    const code = String(option.code ?? option.key ?? '')
    return {
      id: `${listKey}:${code}`,
      code,
      label: textValue(option.labels as Json, uiLanguage) || code,
      listKey,
    }
  })
}

function useModelDefs() {
  const queryClient = useQueryClient()
  const stored = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const draft = useQuery({ queryKey: ['model-draft'], queryFn: () => api.get('/v1/model/draft') })
  useEffect(() => onDraftChange(() => {
    void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
  }), [queryClient])
  const preview = draft.data?.conflict === true ? undefined : (draft.data?.definitions as Json | undefined)
  return { stored, defs: preview ?? stored.data, draft }
}

async function reviewDraft() {
  window.dispatchEvent(new Event('braian-review-save'))
}


/** Local active row for StandardEditableTable selection chrome (same pattern as Attribute definitions). */
function useActiveRowId() {
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  return { activeRowId, setActiveRowId }
}

export function ObjectTypesTable() {
  const { stored, defs } = useModelDefs()
  const [filter, setFilter] = useState('')
  const { activeRowId, setActiveRowId } = useActiveRowId()
  const [draftRows, setDraftRows] = useState<Record<string, TypeRow>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [singularName, setSingularName] = useState('')
  const [pluralName, setPluralName] = useState('')
  const [typeKey, setTypeKey] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const rows = useMemo(() => {
    const raw = ((defs?.types as Json[]) ?? []).filter((item) => item.kind !== 'link')
    return objectTypes({ ...defs, types: raw }, uiLanguage).map((item) => ({
      id: item.key,
      key: item.key,
      label: item.label,
      singular: item.singular,
      plural: item.plural || item.label,
      kind: 'object',
    }))
  }, [defs])

  useEffect(() => {
    if (!pendingKey) return
    const row = rows.find((item) => item.id === pendingKey || item.key === pendingKey)
    if (!row) return
    setActiveRowId(row.id)
    setModelFocus({ kind: 'type', key: row.key })
    setPendingKey(null)
    clearPendingModelType(row.key)
  }, [rows, pendingKey])

  // The selected type survives a reload through model-selection. Put it back
  // into this table's row state too, so the Object types row is highlighted,
  // not only the Type attributes title.
  useEffect(() => {
    const restore = () => {
      const selection = getModelSelection()
      if (selection?.kind !== 'type') return
      if (!rows.some((item) => item.id === selection.typeKey || item.key === selection.typeKey)) return
      setActiveRowId(selection.typeKey)
    }
    restore()
    return subscribeModelSelection(restore)
  }, [rows])

  useEffect(() => {
    const open = () => {
      const key = peekPendingModelType()
      if (key) setPendingKey(key)
    }
    window.addEventListener(OPEN_MODEL_TYPE, open)
    open()
    return () => window.removeEventListener(OPEN_MODEL_TYPE, open)
  }, [])

  const columns: Array<StandardColumn<TypeRow>> = [
    {
      id: 'singular',
      header: copy.singular,
      editable: true,
      read: (row) => row.singular,
      write: (row, value) => ({ ...row, singular: value, label: value || row.label }),
    },
    {
      id: 'plural',
      header: copy.plural,
      editable: true,
      read: (row) => row.plural,
      write: (row, value) => ({ ...row, plural: value }),
    },
    {
      id: 'key',
      header: copy.key,
      editable: true,
      read: (row) => row.key,
      write: (row, value) => ({ ...row, key: value }),
    },
  ]

  if (stored.isPending) return <StateNote tone="loading" title={copy.loadingModel} />
  if (stored.isError) return <StateNote tone="error" title={copy.errorModel} />

  return (
    <>
    <StandardEditableTable
      testId="object-types-table"
      columns={columns}
      rows={rows}
      draftRows={draftRows}
      onDraftRowsChange={setDraftRows}
      onNewRow={() => {
        setSingularName('')
        setPluralName('')
        setTypeKey('')
        setCreateOpen(true)
      }}
      newRowLabel={copy.newType}
      filterValue={filter}
      onFilterChange={(value) => {
        setFilter(value)
        setActiveRowId(null)
      }}
      activeRowId={activeRowId}
      getRowKeyAttr={(row) => row.key}
      menuContext={(row) => (row?.key ? 'model-type' : 'model')}
      getMenuTarget={(row) => ({ typeKey: row?.key || undefined })}
      onActivateRow={(row) => {
        setActiveRowId(row.id)
        if (!row.key) return
        tryChooseModelSelection({ kind: 'type', typeKey: row.key })
        setModelFocus({ kind: 'type', key: row.key })
      }}
      onReviewAndSave={async () => {
        for (const row of Object.values(draftRows)) {
          const existing = rows.some((item) => item.id === row.id)
          if (!existing) {
            await stageModel('model.create_type', {
              key: row.key || row.singular.toLowerCase().replace(/\s+/g, '_'),
              singular: row.singular,
              plural: row.plural || row.singular,
              language: uiLanguage,
            })
          } else {
            await stageModel('model.update_type', {
              key: row.id,
              singular: row.singular,
              plural: row.plural,
              language: uiLanguage,
              ...(row.key !== row.id ? { new_key: row.key } : {}),
            })
          }
        }
        setDraftRows({})
        await reviewDraft()
      }}
    />
    <CreateDialog
      open={createOpen}
      title={copy.newType}
      description={copy.createNameHint}
      fields={[
        { id: 'singular', label: copy.singular, value: singularName, testId: 'new-name', autoFocus: true },
        { id: 'plural', label: copy.plural, value: pluralName, testId: 'new-plural' },
        { id: 'key', label: copy.key, value: typeKey, testId: 'new-key' },
      ]}
      onField={(id, value) => {
        if (id === 'singular') setSingularName(value)
        else if (id === 'plural') setPluralName(value)
        else setTypeKey(value)
      }}
      onClose={() => setCreateOpen(false)}
      onSubmit={async () => {
        const singular = requireText(singularName)
        const key = attributeKey(typeKey || singular)
        if (!key) throw new Error(copy.validation)
        await stageModel('model.create_type', {
          key,
          label: singular,
          singular,
          plural: pluralName.trim() || singular,
          language: uiLanguage,
        })
        setPendingKey(key)
      }}
    />
    </>
  )
}

export function LinkTypesTable({ draftScope }: { draftScope?: ModelTableDraftScope }) {
  const queryClient = useQueryClient()
  const { stored, defs } = useModelDefs()
  const [filter, setFilter] = useState('')
  const { activeRowId, setActiveRowId } = useActiveRowId()
  const serverRows = useMemo(() => linkTypeRows(defs, uiLanguage), [defs])
  const [draftRows, setDraftRows] = useState<Record<string, LinkTypeRow>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [fromType, setFromType] = useState('')
  const [toType, setToType] = useState('')
  const [fromCardinality, setFromCardinality] = useState('many')
  const [toCardinality, setToCardinality] = useState('many')
  const [fromLabel, setFromLabel] = useState('')
  const [toLabel, setToLabel] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const entityKeys = useMemo(() => entityTypeKeys(defs), [defs])
  const entityChoices = useMemo(
    () => typeNames(defs, uiLanguage)
      .filter((item) => item.kind === 'entity')
      .map((item) => ({ value: item.key, label: item.singular || item.key })),
    [defs],
  )
  const cardinalityOptions = useMemo(
    () => [
      { value: 'one', label: copy.cardinalityOne },
      { value: 'many', label: copy.cardinalityMany },
    ],
    [],
  )

  useEffect(() => {
    if (!draftScope?.userId || !draftScope.workspaceId) return
    const storedDraft = readStoredLinkTypesTableDraft(draftScope.userId, draftScope.workspaceId)
    if (!storedDraft) return
    const { draftRows: restored } = restoreLinkTypesTableDraft(storedDraft, serverRows)
    if (Object.keys(restored).length > 0) setDraftRows(restored)
  }, [draftScope?.userId, draftScope?.workspaceId, serverRows])

  useEffect(() => {
    if (!draftScope?.userId || !draftScope.workspaceId) return
    if (Object.keys(draftRows).length === 0) {
      clearStoredLinkTypesTableDraft(draftScope.userId, draftScope.workspaceId)
      return
    }
    const payload = {
      v: 1 as const,
      draftRows: Object.fromEntries(
        Object.entries(draftRows).flatMap(([id, row]) => {
          const server = serverRows.find((item) => item.id === id)
          if (!server) return []
          const stored = serializeLinkTypeDraftRow(server, row)
          return stored ? [[id, stored]] : []
        }),
      ),
    }
    writeStoredLinkTypesTableDraft(draftScope.userId, draftScope.workspaceId, payload)
  }, [draftRows, draftScope?.userId, draftScope?.workspaceId, serverRows])

  const dirty = useCallback(() => Object.keys(draftRows).length > 0, [draftRows])
  const discardDraft = useCallback(() => {
    setDraftRows({})
    if (draftScope?.userId && draftScope.workspaceId) {
      clearStoredLinkTypesTableDraft(draftScope.userId, draftScope.workspaceId)
    }
  }, [draftScope?.userId, draftScope?.workspaceId])
  const flushLinkTypesDraft = useCallback(async () => {
    const steps: Array<{ op: string } & Record<string, unknown>> = []
    for (const row of Object.values(draftRows)) {
      const server = serverRows.find((item) => item.id === row.id)
      if (!server) {
        steps.push(...buildLinkTypeCreateSteps(row))
        continue
      }
      steps.push(...buildLinkTypeUpdateSteps(server, row))
    }
    if (steps.length > 0) await stageModelSteps(steps)
    discardDraft()
    await queryClient.invalidateQueries({ queryKey: ['model-draft'] })
  }, [discardDraft, draftRows, queryClient, serverRows])

  const reviewDraftRows = useCallback(async () => {
    await flushLinkTypesDraft()
    await reviewDraft()
  }, [flushLinkTypesDraft])

  useEffect(() => {
    registerModelTableDraft({
      dirty,
      discard: discardDraft,
      review: reviewDraftRows,
      flushToDraft: flushLinkTypesDraft,
    })
    return () => registerModelTableDraft(null)
  }, [dirty, discardDraft, flushLinkTypesDraft, reviewDraftRows])

  useEffect(() => {
    if (!pendingKey) return
    const row = serverRows.find((item) => item.id === pendingKey || item.key === pendingKey)
    if (!row) return
    setActiveRowId(row.id)
    setModelFocus({ kind: 'type', key: row.key })
    tryChooseModelSelection({ kind: 'type', typeKey: row.key })
    setPendingKey(null)
  }, [serverRows, pendingKey])

  const columns: Array<StandardColumn<LinkTypeRow>> = [
    {
      id: 'key',
      header: copy.key,
      editable: true,
      truncate: true,
      read: (row) => row.key,
      write: (row, value) => ({ ...row, key: value }),
      validate: (value) => (attributeKey(value) ? undefined : copy.validation),
    },
    {
      id: 'fromType',
      header: copy.fromType,
      type: 'enum',
      enumSelect: true,
      editable: true,
      options: entityChoices,
      read: (row) => row.fromType,
      write: (row, value) => ({ ...row, fromType: value }),
    },
    {
      id: 'toType',
      header: copy.toType,
      type: 'enum',
      enumSelect: true,
      editable: true,
      options: entityChoices,
      read: (row) => row.toType,
      write: (row, value) => ({ ...row, toType: value }),
    },
    {
      id: 'fromLabel',
      header: copy.linkForwardLabel,
      editable: true,
      truncate: true,
      read: (row) => row.fromLabel,
      write: (row, value) => ({ ...row, fromLabel: value }),
    },
    {
      id: 'toLabel',
      header: copy.linkReverseLabel,
      editable: true,
      truncate: true,
      read: (row) => row.toLabel,
      write: (row, value) => ({ ...row, toLabel: value }),
    },
    {
      id: 'fromCardinality',
      header: `${copy.fromType} ${copy.cardinality}`,
      type: 'enum',
      enumSelect: true,
      editable: true,
      options: cardinalityOptions,
      read: (row) => row.fromCardinality,
      write: (row, value) => ({ ...row, fromCardinality: value === 'one' ? 'one' : 'many' }),
    },
    {
      id: 'toCardinality',
      header: `${copy.toType} ${copy.cardinality}`,
      type: 'enum',
      enumSelect: true,
      editable: true,
      options: cardinalityOptions,
      read: (row) => row.toCardinality,
      write: (row, value) => ({ ...row, toCardinality: value === 'one' ? 'one' : 'many' }),
    },
  ]

  if (stored.isPending) return <StateNote tone="loading" title={copy.loadingModel} />
  if (stored.isError) return <StateNote tone="error" title={copy.errorModel} />

  return (
    <>
    <StandardEditableTable
      testId="link-types-table"
      columns={columns}
      rows={serverRows}
      draftRows={draftRows}
      onDraftRowsChange={setDraftRows}
      reviewVisible={dirty()}
      onNewRow={() => {
        setLinkName('')
        setFromLabel('')
        setToLabel('')
        setFromType(entityKeys[0] ?? '')
        setToType(entityKeys[0] ?? '')
        setFromCardinality('many')
        setToCardinality('many')
        setCreateOpen(true)
      }}
      newRowLabel={copy.newLinkType}
      filterValue={filter}
      onFilterChange={(value) => {
        setFilter(value)
        setActiveRowId(null)
      }}
      activeRowId={activeRowId}
      getRowKeyAttr={(row) => row.key}
      menuContext={(row) => (row?.key ? 'model-link' : 'model')}
      getMenuTarget={(row) => ({ typeKey: row?.key || undefined })}
      onActivateRow={(row) => {
        setActiveRowId(row.id)
        if (!row.key) return
        tryChooseModelSelection({ kind: 'type', typeKey: row.key })
        setModelFocus({ kind: 'type', key: row.key })
      }}
      onReviewAndSave={reviewDraftRows}
    />
    <CreateDialog
      open={createOpen}
      title={copy.newLinkType}
      description={copy.createNameHint}
      fields={[
        { id: 'name', label: copy.name, value: linkName, testId: 'new-name', autoFocus: true },
        { id: 'from', label: copy.fromType, value: fromType, testId: 'link-type-from', options: entityChoices },
        { id: 'to', label: copy.toType, value: toType, testId: 'link-type-to', options: entityChoices },
        { id: 'fromLabel', label: copy.linkForwardLabel, value: fromLabel, testId: 'link-type-from-label' },
        { id: 'toLabel', label: copy.linkReverseLabel, value: toLabel, testId: 'link-type-to-label' },
        { id: 'fromCardinality', label: `${copy.fromType} ${copy.cardinality}`, value: fromCardinality, testId: 'link-type-from-cardinality', options: cardinalityOptions },
        { id: 'toCardinality', label: `${copy.toType} ${copy.cardinality}`, value: toCardinality, testId: 'link-type-to-cardinality', options: cardinalityOptions },
      ]}
      onField={(id, value) => {
        if (id === 'name') setLinkName(value)
        else if (id === 'from') setFromType(value)
        else if (id === 'to') setToType(value)
        else if (id === 'fromLabel') setFromLabel(value)
        else if (id === 'toLabel') setToLabel(value)
        else if (id === 'fromCardinality') setFromCardinality(value)
        else setToCardinality(value)
      }}
      onClose={() => setCreateOpen(false)}
      onSubmit={async () => {
        const name = requireText(linkName)
        const key = attributeKey(name)
        if (!key || !fromType || !toType) throw new Error(copy.validation)
        const row: LinkTypeRow = {
          id: key,
          key,
          fromType,
          toType,
          fromLabel: fromLabel.trim() || name,
          toLabel: toLabel.trim() || name,
          fromCardinality: fromCardinality === 'one' ? 'one' : 'many',
          toCardinality: toCardinality === 'one' ? 'one' : 'many',
        }
        const steps = buildLinkTypeCreateSteps(row)
        if (steps.length === 0) throw new Error(copy.validation)
        await stageModelSteps(steps)
        setPendingKey(key)
      }}
    />
    </>
  )
}

export function ValueListsTable({ onOpenList }: { onOpenList?: (key: string) => void }) {
  const { stored, defs } = useModelDefs()
  const [filter, setFilter] = useState('')
  const { activeRowId, setActiveRowId } = useActiveRowId()
  const [draftRows, setDraftRows] = useState<Record<string, ListRow>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [listName, setListName] = useState('')
  const [listKeyField, setListKeyField] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const rows = useMemo<ListRow[]>(
    () =>
      ((defs?.value_lists as Json[]) ?? []).map((list) => {
        const key = String(list.key ?? '')
        return {
          id: key,
          key,
          label: textValue(list.labels as Json, uiLanguage) || key,
          optionCount: ((list.options as Json[]) ?? []).length,
        }
      }),
    [defs],
  )

  useEffect(() => {
    if (!pendingKey) return
    const row = rows.find((item) => item.id === pendingKey || item.key === pendingKey)
    if (!row) return
    setActiveRowId(row.id)
    setModelFocus({ kind: 'value_list', key: row.key })
    setPendingKey(null)
  }, [rows, pendingKey])

  const columns: Array<StandardColumn<ListRow>> = [
    {
      id: 'label',
      header: copy.name,
      editable: true,
      read: (row) => row.label,
      write: (row, value) => ({ ...row, label: value }),
    },
    {
      id: 'key',
      header: copy.key,
      editable: true,
      read: (row) => row.key,
      write: (row, value) => ({ ...row, key: value }),
    },
    {
      id: 'options',
      header: copy.rows,
      type: 'readonly',
      editable: false,
      read: (row) => row.optionCount,
    },
  ]

  if (stored.isPending) return <StateNote tone="loading" title={copy.loadingModel} />
  if (stored.isError) return <StateNote tone="error" title={copy.errorModel} />

  return (
    <>
    <StandardEditableTable
      testId="value-lists-table"
      columns={columns}
      rows={rows}
      draftRows={draftRows}
      onDraftRowsChange={setDraftRows}
      onNewRow={() => {
        setListName('')
        setListKeyField('')
        setCreateOpen(true)
      }}
      newRowLabel={copy.newValueList}
      filterValue={filter}
      onFilterChange={(value) => {
        setFilter(value)
        setActiveRowId(null)
      }}
      activeRowId={activeRowId}
      menuContext={(row) => (row?.key ? 'model-list' : 'model')}
      getMenuTarget={(row) => ({ listKey: row?.key || undefined })}
      onActivateRow={(row) => {
        setActiveRowId(row.id)
        if (!row.key) return
        setModelFocus({ kind: 'value_list', key: row.key })
        onOpenList?.(row.key)
        window.dispatchEvent(new CustomEvent('braian-open-value-list', { detail: { key: row.key } }))
      }}
      onReviewAndSave={async () => {
        for (const row of Object.values(draftRows)) {
          const existing = rows.some((item) => item.id === row.id)
          if (!existing) {
            await stageModel('model.create_value_list', {
              key: row.key || row.label.toLowerCase().replace(/\s+/g, '_'),
              label: row.label,
              language: uiLanguage,
            })
          } else {
            await stageModel('model.update_value_list', {
              key: row.id,
              label: row.label,
              language: uiLanguage,
            })
          }
        }
        setDraftRows({})
        await reviewDraft()
      }}
    />
    <CreateDialog
      open={createOpen}
      title={copy.newValueList}
      description={copy.createNameHint}
      fields={[
        { id: 'name', label: copy.name, value: listName, testId: 'new-name', autoFocus: true },
        { id: 'key', label: copy.key, value: listKeyField, testId: 'new-key' },
      ]}
      onField={(id, value) => {
        if (id === 'name') setListName(value)
        else setListKeyField(value)
      }}
      onClose={() => setCreateOpen(false)}
      onSubmit={async () => {
        const label = requireText(listName)
        const key = attributeKey(listKeyField || label)
        if (!key) throw new Error(copy.validation)
        await stageModel('model.create_value_list', { key, label, language: uiLanguage })
        setPendingKey(key)
      }}
    />
    </>
  )
}

export function ValueListValuesTable({ listKey }: { listKey: string }) {
  const { stored, defs } = useModelDefs()
  const [filter, setFilter] = useState('')
  const { activeRowId, setActiveRowId } = useActiveRowId()
  const [draftRows, setDraftRows] = useState<Record<string, OptionRow>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [optionName, setOptionName] = useState('')
  const [optionCode, setOptionCode] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const rows = useMemo(() => valueListOptions(defs, listKey), [defs, listKey])

  useEffect(() => {
    if (!pendingKey) return
    const row = rows.find((item) => item.id === pendingKey || item.code === pendingKey)
    if (!row) return
    setActiveRowId(row.id)
    setPendingKey(null)
  }, [rows, pendingKey])

  const columns: Array<StandardColumn<OptionRow>> = [
    {
      id: 'label',
      header: copy.name,
      editable: true,
      read: (row) => row.label,
      write: (row, value) => ({ ...row, label: value }),
    },
    {
      id: 'code',
      header: copy.key,
      editable: true,
      read: (row) => row.code,
      write: (row, value) => ({ ...row, code: value }),
    },
  ]

  if (!listKey) return <StateNote tone="empty" title={copy.pickValueList} />
  if (stored.isPending) return <StateNote tone="loading" title={copy.loadingModel} />

  return (
    <>
    <StandardEditableTable
      testId="value-list-values-table"
      columns={columns}
      rows={rows}
      draftRows={draftRows}
      onDraftRowsChange={setDraftRows}
      onNewRow={() => {
        setOptionName('')
        setOptionCode('')
        setCreateOpen(true)
      }}
      newRowLabel={copy.newListValue}
      filterValue={filter}
      onFilterChange={(value) => {
        setFilter(value)
        setActiveRowId(null)
      }}
      activeRowId={activeRowId}
      onActivateRow={(row) => setActiveRowId(row.id)}
      menuContext={(row) => (row?.code ? 'model-option' : 'model-list')}
      getMenuTarget={(row) => ({
        listKey: row?.listKey || listKey,
        optionCode: row?.code || undefined,
      })}
      onReviewAndSave={async () => {
        for (const row of Object.values(draftRows)) {
          const existing = rows.some((item) => item.id === row.id)
          if (!existing) {
            await stageModel('model.add_value_option', {
              value_list: listKey,
              option: row.code || row.label.toLowerCase().replace(/\s+/g, '_'),
              label: row.label,
              language: uiLanguage,
            })
          } else {
            await stageModel('model.update_value_option', {
              value_list: listKey,
              option: row.id.split(':').pop(),
              label: row.label,
              language: uiLanguage,
              ...(row.code !== row.id.split(':').pop() ? { new_code: row.code } : {}),
            })
          }
        }
        setDraftRows({})
        await reviewDraft()
      }}
    />
    <CreateDialog
      open={createOpen}
      title={copy.newListValue}
      description={copy.createNameHint}
      fields={[
        { id: 'name', label: copy.name, value: optionName, testId: 'new-name', autoFocus: true },
        { id: 'code', label: copy.key, value: optionCode, testId: 'new-key' },
      ]}
      onField={(id, value) => {
        if (id === 'name') setOptionName(value)
        else setOptionCode(value)
      }}
      onClose={() => setCreateOpen(false)}
      onSubmit={async () => {
        const label = requireText(optionName)
        const code = attributeKey(optionCode || label)
        if (!code) throw new Error(copy.validation)
        await stageModel('model.update_value_list', {
          key: listKey,
          options: [...rows.map((row) => ({ code: row.code, label: row.label })), { code, label }],
        })
        setPendingKey(code)
      }}
    />
    </>
  )
}

export function UnitsTable() {
  const { stored, defs } = useModelDefs()
  const [filter, setFilter] = useState('')
  const { activeRowId, setActiveRowId } = useActiveRowId()
  const [draftRows, setDraftRows] = useState<Record<string, UnitRow>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [familyName, setFamilyName] = useState('')
  const [unitCode, setUnitCode] = useState('')
  const [factor, setFactor] = useState('1')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const rows = useMemo<UnitRow[]>(() => {
    const out: UnitRow[] = []
    for (const family of (defs?.unit_families as Json[] | undefined) ?? []) {
      const familyKey = String(family.key ?? '')
      for (const unit of (family.units as Json[] | undefined) ?? []) {
        const code = String(unit.code ?? '')
        out.push({
          id: `${familyKey}:${code}`,
          family: familyKey,
          code,
          factor: String(unit.factor ?? '1'),
        })
      }
      if (((family.units as Json[] | undefined) ?? []).length === 0) {
        out.push({ id: `${familyKey}:`, family: familyKey, code: '', factor: '' })
      }
    }
    return out
  }, [defs])

  useEffect(() => {
    if (!pendingId) return
    const row = rows.find((item) => item.id === pendingId)
    if (!row) return
    setActiveRowId(row.id)
    setPendingId(null)
  }, [rows, pendingId])

  const columns: Array<StandardColumn<UnitRow>> = [
    {
      id: 'family',
      header: copy.unitFamilies,
      editable: true,
      read: (row) => row.family,
      write: (row, value) => ({ ...row, family: value }),
    },
    {
      id: 'code',
      header: copy.unit,
      editable: true,
      read: (row) => row.code,
      write: (row, value) => ({ ...row, code: value }),
    },
    {
      id: 'factor',
      header: copy.number,
      type: 'number',
      editable: true,
      read: (row) => row.factor,
      write: (row, value) => ({ ...row, factor: value }),
    },
  ]

  if (stored.isPending) return <StateNote tone="loading" title={copy.loadingModel} />
  if (stored.isError) return <StateNote tone="error" title={copy.errorModel} />

  return (
    <>
    <StandardEditableTable
      testId="units-table"
      columns={columns}
      rows={rows}
      draftRows={draftRows}
      onDraftRowsChange={setDraftRows}
      onNewRow={() => {
        setFamilyName('')
        setUnitCode('')
        setFactor('1')
        setCreateOpen(true)
      }}
      newRowLabel={copy.newUnit}
      filterValue={filter}
      onFilterChange={(value) => {
        setFilter(value)
        setActiveRowId(null)
      }}
      activeRowId={activeRowId}
      onActivateRow={(row) => setActiveRowId(row.id)}
      menuContext={(row) => {
        if (row?.code) return 'model-unit'
        if (row?.family) return 'model-family'
        return 'model'
      }}
      getMenuTarget={(row) => ({
        familyKey: row?.family || undefined,
        unitCode: row?.code || undefined,
      })}
      onReviewAndSave={async () => {
        for (const row of Object.values(draftRows)) {
          const existing = rows.some((item) => item.id === row.id)
          if (!existing) {
            const hasFamily = ((defs?.unit_families as Json[]) ?? []).some((item) => String(item.key) === row.family)
            if (!hasFamily && row.family) {
              await stageModel('model.create_unit_family', {
                key: row.family,
                base_unit: row.code || row.family,
                units: row.code ? [{ code: row.code, factor: row.factor || '1' }] : [],
              })
            } else if (row.code) {
              await stageModel('model.add_unit', {
                unit_family: row.family,
                code: row.code,
                factor: row.factor || '1',
              })
            }
          } else if (row.code) {
            await stageModel('model.update_unit', {
              unit_family: row.family,
              unit: row.id.split(':').pop(),
              factor: row.factor,
            })
          }
        }
        setDraftRows({})
        await reviewDraft()
      }}
    />
    <CreateDialog
      open={createOpen}
      title={copy.newUnit}
      description={copy.createNameHint}
      fields={[
        { id: 'family', label: copy.unitFamilies, value: familyName, testId: 'new-name', autoFocus: true },
        { id: 'code', label: copy.unit, value: unitCode, testId: 'new-key' },
        { id: 'factor', label: copy.factor, value: factor, testId: 'new-factor' },
      ]}
      onField={(id, value) => {
        if (id === 'family') setFamilyName(value)
        else if (id === 'code') setUnitCode(value)
        else setFactor(value)
      }}
      onClose={() => setCreateOpen(false)}
      onSubmit={async () => {
        const family = requireText(familyName)
        const code = unitCode.trim() || family
        const hasFamily = ((defs?.unit_families as Json[]) ?? []).some((item) => String(item.key) === family)
        if (!hasFamily) {
          await stageModel('model.create_unit_family', {
            key: family,
            dimension: family,
            base_unit: code,
            units: [{ code, factor: factor.trim() || '1' }],
          })
        } else {
          await stageModel('model.add_unit', {
            unit_family: family,
            code,
            factor: factor.trim() || '1',
          })
        }
        setPendingId(`${family}:${code}`)
      }}
    />
    </>
  )
}

/** Thin wrapper kept for shell routing. */
export function ModelTableView({ view, draftScope }: { view: { type: string; state: Json }; draftScope?: ModelTableDraftScope }) {
  if (view.type === 'object_types') return <ObjectTypesTable />
  if (view.type === 'link_types') return <LinkTypesTable draftScope={draftScope} />
  if (view.type === 'value_lists') return <ValueListsTable />
  if (view.type === 'value_list_values') return <ValueListValuesTable listKey={String(view.state.list_key ?? '')} />
  if (view.type === 'units') return <UnitsTable />
  return <StateNote tone="empty" title={copy.unknownView} />
}
