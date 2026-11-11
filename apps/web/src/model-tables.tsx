import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, textValue, type Json } from './api'
import { CreateDialog, requireText } from './create-dialog'
import { copy, uiLanguage } from './i18n'
import { attributeKey, objectTypes } from './model-view'
import { onDraftChange, setModelFocus, stageModel } from './model-stage'
import { StandardEditableTable, type StandardColumn } from './standard-editable-table'
import { chooseModelSelection, getModelSelection, subscribeModelSelection } from './model-selection'
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
        chooseModelSelection({ kind: 'type', typeKey: row.key })
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

export function LinkTypesTable() {
  const { stored, defs } = useModelDefs()
  const [filter, setFilter] = useState('')
  const { activeRowId, setActiveRowId } = useActiveRowId()
  const [draftRows, setDraftRows] = useState<Record<string, TypeRow>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [fromType, setFromType] = useState('')
  const [toType, setToType] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const entities = useMemo(
    () => ((defs?.types as Json[]) ?? [])
      .filter((item) => item.kind !== 'link')
      .map((item) => String(item.key ?? ''))
      .filter(Boolean),
    [defs],
  )
  const rows = useMemo(() => {
    const raw = ((defs?.types as Json[]) ?? []).filter((item) => item.kind === 'link')
    return objectTypes({ ...defs, types: raw }, uiLanguage).map((item) => ({
      id: item.key,
      key: item.key,
      label: item.label,
      singular: item.singular,
      plural: item.plural || item.label,
      kind: 'link',
    }))
  }, [defs])

  useEffect(() => {
    if (!pendingKey) return
    const row = rows.find((item) => item.id === pendingKey || item.key === pendingKey)
    if (!row) return
    setActiveRowId(row.id)
    setModelFocus({ kind: 'type', key: row.key })
    setPendingKey(null)
  }, [rows, pendingKey])

  const columns: Array<StandardColumn<TypeRow>> = [
    {
      id: 'singular',
      header: copy.singular,
      editable: true,
      truncate: true,
      read: (row) => row.singular,
      write: (row, value) => ({ ...row, singular: value, label: value || row.label }),
    },
    {
      id: 'plural',
      header: copy.plural,
      editable: true,
      truncate: true,
      read: (row) => row.plural,
      write: (row, value) => ({ ...row, plural: value }),
    },
    {
      id: 'key',
      header: copy.key,
      editable: true,
      truncate: true,
      read: (row) => row.key,
      write: (row, value) => ({ ...row, key: value }),
    },
  ]

  if (stored.isPending) return <StateNote tone="loading" title={copy.loadingModel} />
  if (stored.isError) return <StateNote tone="error" title={copy.errorModel} />

  return (
    <>
    <StandardEditableTable
      testId="link-types-table"
      columns={columns}
      rows={rows}
      draftRows={draftRows}
      onDraftRowsChange={setDraftRows}
      onNewRow={() => {
        setLinkName('')
        setFromType(entities[0] ?? '')
        setToType(entities[0] ?? '')
        setCreateOpen(true)
      }}
      newRowLabel={copy.newLinkType}
      filterValue={filter}
      onFilterChange={(value) => {
        setFilter(value)
        setActiveRowId(null)
      }}
      activeRowId={activeRowId}
      menuContext={(row) => (row?.key ? 'model-link' : 'model')}
      getMenuTarget={(row) => ({ typeKey: row?.key || undefined })}
      onActivateRow={(row) => {
        setActiveRowId(row.id)
        if (!row.key) return
        setModelFocus({ kind: 'type', key: row.key })
      }}
      onReviewAndSave={async () => {
        for (const row of Object.values(draftRows)) {
          const existing = rows.some((item) => item.id === row.id)
          if (!existing) {
            await stageModel('model.create_link_type', {
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
            })
          }
        }
        setDraftRows({})
        await reviewDraft()
      }}
    />
    <CreateDialog
      open={createOpen}
      title={copy.newLinkType}
      description={copy.createNameHint}
      fields={[
        { id: 'name', label: copy.name, value: linkName, testId: 'new-name', autoFocus: true },
        { id: 'from', label: copy.fromType, value: fromType, testId: 'new-type', options: entities.map((key) => ({ value: key, label: key })) },
        { id: 'to', label: copy.toType, value: toType, testId: 'new-to-type', options: entities.map((key) => ({ value: key, label: key })) },
      ]}
      onField={(id, value) => {
        if (id === 'name') setLinkName(value)
        else if (id === 'from') setFromType(value)
        else setToType(value)
      }}
      onClose={() => setCreateOpen(false)}
      onSubmit={async () => {
        const name = requireText(linkName)
        const key = attributeKey(name)
        if (!key || !fromType || !toType) throw new Error(copy.validation)
        const side = attributeKey(name)
        await stageModel('model.create_link_type', {
          key,
          label: name,
          singular: name,
          plural: name,
          language: uiLanguage,
          from_types: [fromType],
          to_types: [toType],
          from_key: side,
          from_label: name,
          to_key: `${side}_to`,
          to_label: name,
          from_cardinality: 'many',
          to_cardinality: 'many',
          attributes: [],
        })
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
export function ModelTableView({ view }: { view: { type: string; state: Json } }) {
  if (view.type === 'object_types') return <ObjectTypesTable />
  if (view.type === 'link_types') return <LinkTypesTable />
  if (view.type === 'value_lists') return <ValueListsTable />
  if (view.type === 'value_list_values') return <ValueListValuesTable listKey={String(view.state.list_key ?? '')} />
  if (view.type === 'units') return <UnitsTable />
  return <StateNote tone="empty" title={copy.unknownView} />
}
