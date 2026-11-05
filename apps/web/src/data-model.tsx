import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, MoreHorizontal } from 'lucide-react'
import { ApiError, api, textValue, type Json } from './api'
import { formatCount } from './format'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu'
import { copy, uiLanguage } from './i18n'
import {
  attributeConflict,
  attributeKey,
  attributeRows,
  objectTypes,
  type AttributeRow,
  type ModelSelection,
} from './model-view'
import { structureCaption } from './graph-scene'
import { StructureSection } from './structure-tree'
import { StateNote } from './states'
import { onDraftChange, requestReview, setModelFocus, stageModel, stageModelSteps } from './model-stage'
import { chooseModelSelection, getModelSelection, getPreviewType, setPreviewType, subscribeModelSelection } from './model-selection'
import { CreateDialog, requireText } from './create-dialog'
import { onAttributeAction, type AttributeAction } from './attribute-actions'
import { writeErrorMessage } from './write-error'
import { ROW_ORDER_KEY, StandardEditableTable, type StandardColumn } from './standard-editable-table'

type View = { state: Json }

const KINDS = [
  ['text', copy.kindText],
  ['number', copy.number],
  ['boolean', copy.kindBoolean],
  ['date', copy.kindDate],
  ['value_list', copy.kindValueList],
  ['range', copy.kindRange],
  ['file_ref', copy.kindFile],
] as const

function useModelSelection() {
  const [value, setValue] = useState({ selection: getModelSelection(), previewType: getPreviewType() })
  useEffect(() => subscribeModelSelection(() => {
    setValue({ selection: getModelSelection(), previewType: getPreviewType() })
  }), [])
  return { ...value, choose: chooseModelSelection, setPreviewType }
}

async function propose(name: string, args: Json) {
  return stageModel(name, args)
}

export function DataModel({ view }: { view: View }) {
  const queryClient = useQueryClient()
  const stored = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const draft = useQuery({ queryKey: ['model-draft'], queryFn: () => api.get('/v1/model/draft') })
  useEffect(() => onDraftChange(() => {
    void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
  }), [queryClient])
  const mode = String(view.state.mode ?? '')
  if (stored.isPending) return <div data-testid="data-model"><StateNote tone="loading" title={copy.loadingModel} /></div>
  if (stored.isError) return <div data-testid="data-model"><StateNote tone="error" title={copy.errorModel} detail={copy.validation} /></div>
  const preview = draft.data?.conflict === true ? undefined : (draft.data?.definitions as Json | undefined)
  const defs = preview ?? stored.data
  // Preview (card) removed. Structures stay as a tree (not ModelNav type/list chrome).
  // Object/link/value list/unit tables cover those entities. Type attributes use mode=classes.
  if (mode === 'classes' || mode === 'attributes') return <AttributesTable defs={defs} />
  if (mode === 'impact') return <ImpactNote />
  if (mode === 'card' || mode === 'editor') return <StateNote tone="empty" title={copy.pickModel} />
  return <StructuresPane defs={defs} />
}

function StructuresPane({ defs }: { defs: Json | undefined }) {
  const { selection, choose } = useModelSelection()
  return (
    <div data-testid="data-model" className="model-nav">
      <StructureSection defs={defs} selection={selection} onPick={choose} />
    </div>
  )
}


type AttributeTableRow = AttributeRow & {
  standard: boolean
  multiple: boolean
  min: string
  max: string
  valueList: string
}

function detailRow(defs: Json | undefined, row: AttributeRow): AttributeTableRow {
  const raw = ((defs?.attributes as Json[]) ?? []).find(
    (item) => String(item.id ?? '') === row.id || String(item.key ?? '') === row.key,
  )
  const kind = (raw?.kind as Json) ?? {}
  return {
    ...row,
    standard: standardAttribute(row.id),
    multiple: Boolean(raw?.multiple),
    min: kind.min === null || kind.min === undefined ? '' : String(kind.min),
    max: kind.max === null || kind.max === undefined ? '' : String(kind.max),
    valueList: String(kind.list ?? ''),
  }
}

function errorText(reason: unknown) {
  return reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : copy.validation
}

function AttributeMenu({
  row,
  lists,
  onPatch,
  onDetach,
  onDelete,
}: {
  row: AttributeTableRow
  lists: string[]
  onPatch: (patch: Partial<AttributeTableRow>) => void
  onDetach?: () => void
  onDelete?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="icon-btn" aria-label={copy.more} data-testid={`attr-menu-${row.key || row.id}`}>
        <MoreHorizontal size={14} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {row.kind === 'number' ? (
          <div className="attr-menu-field" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            <label>
              {copy.min}
              <input aria-label={copy.min} value={row.min} onChange={(event) => onPatch({ min: event.target.value })} />
            </label>
            <label>
              {copy.max}
              <input aria-label={copy.max} value={row.max} onChange={(event) => onPatch({ max: event.target.value })} />
            </label>
          </div>
        ) : null}
        {row.kind === 'value_list' ? (
          <div className="attr-menu-field" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            <label>
              {copy.valueList}
              <select
                aria-label={copy.valueList}
                value={row.valueList || 'none'}
                onChange={(event) => onPatch({ valueList: event.target.value === 'none' ? '' : event.target.value })}
              >
                <option value="none">{copy.noValue}</option>
                {lists.map((list) => <option key={list} value={list}>{list}</option>)}
              </select>
            </label>
          </div>
        ) : null}
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onPatch({ multiple: !row.multiple }) }}>
          {copy.multiple}{row.multiple ? ' · on' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onPatch({ filterable: !row.filterable }) }}>
          {copy.filterable}{row.filterable ? ' · on' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onPatch({ sortable: !row.sortable }) }}>
          {copy.sortable}{row.sortable ? ' · on' : ''}
        </DropdownMenuItem>
        {onDetach ? <DropdownMenuItem onSelect={onDetach}>{copy.removeFromThisType}</DropdownMenuItem> : null}
        {onDelete ? <DropdownMenuItem onSelect={onDelete}>{copy.deleteAttributeEverywhere}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AttributesTable({ defs }: { defs: Json | undefined }) {
  const queryClient = useQueryClient()
  const { selection } = useModelSelection()
  const [filter, setFilter] = useState('')
  const [draftRows, setDraftRows] = useState<Record<string, AttributeTableRow>>({})
  const [message, setMessage] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createKind, setCreateKind] = useState('text')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const selectionKey = selection ? (selection.kind === 'type' ? selection.typeKey : `${selection.structure}/${selection.group}`) : ''
  const keyAttribute = keyAttributeOf(defs, selection)
  const families = ((defs?.unit_families as Json[]) ?? []).map((item) => String(item.key ?? '')).filter(Boolean)
  const lists = ((defs?.value_lists as Json[]) ?? []).map((item) => String(item.key ?? '')).filter(Boolean)

  useEffect(() => {
    setDraftRows({})
    setFilter('')
    setMessage('')
    setCreateOpen(false)
    setPendingKey(null)
    setActiveRowId(null)
  }, [selectionKey])

  const rows = useMemo(() => {
    const source = attributeRows(defs, selection, uiLanguage).map((row) => detailRow(defs, row))
    if (selection?.kind === 'type') {
      return [...source.filter((row) => row.standard), ...source.filter((row) => !row.standard)]
    }
    return source
  }, [defs, selection])

  useEffect(() => {
    if (!pendingKey) return
    const row = rows.find((item) => item.key === pendingKey)
    if (!row) return
    setActiveRowId(row.id)
    setModelFocus({ kind: 'attribute', key: row.key })
    setPendingKey(null)
  }, [rows, pendingKey])

  const run = (action: AttributeAction) => {
    if (action !== 'new') return
    setCreateName('')
    setCreateKind('text')
    setCreateOpen(true)
  }

  const runRef = useRef(run)
  runRef.current = run
  useEffect(() => onAttributeAction((action) => runRef.current(action)), [])

  if (!selection) {
    return (
      <div data-testid="data-model">
        <StateNote tone="empty" title={copy.pickModel} />
      </div>
    )
  }

  const patch = (row: AttributeTableRow, change: Partial<AttributeTableRow>) => {
    setDraftRows((current) => ({ ...current, [row.id]: { ...row, ...change } }))
  }

  const stageRemove = async (row: AttributeTableRow, deleteDefinition: boolean) => {
    const original = rows.find((item) => item.id === row.id)
    if (!original) {
      setDraftRows((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
      return
    }
    setMessage('')
    try {
      if (deleteDefinition) {
        await stageModelSteps([{ op: 'delete_attribute', key: original.key }])
      } else if (selection.kind === 'type') {
        await stageModelSteps([{ op: 'detach_attribute', attribute: original.key, type_key: selection.typeKey }])
      } else {
        await stageModelSteps([{ op: 'detach_attribute', attribute: original.key, structure: selection.structure, group: selection.group }])
      }
      setDraftRows((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
    } catch (reason) {
      setMessage(errorText(reason))
    }
  }

  const attachArgs = (attribute: string) => selection.kind === 'type'
    ? { attribute, type: selection.typeKey }
    : { attribute, structure: selection.structure, group: selection.group }

  const createRow = async (row: AttributeTableRow) => {
    const label = row.label.trim()
    const key = row.key.trim() || attributeKey(label)
    if (!label || !key) return
    const unit = row.kind === 'number' || row.kind === 'range' ? row.unit : ''
    if (attributeConflict(defs, key, row.kind, unit)) throw new Error(copy.conflictAttribute)
    const exists = ((defs?.attributes as Json[]) ?? []).some((item) => String(item.key) === key)
    if (!exists) {
      await stageModel('model.create_attribute', {
        key,
        label,
        kind: row.kind,
        unit: unit || null,
        multiple: row.multiple,
        languages: row.kind === 'text' ? row.languages : false,
        required: row.required,
        show_by_default: row.showByDefault,
        searchable: row.searchable,
        filterable: row.filterable,
        sortable: row.sortable,
        ...(row.kind === 'number' && row.min.trim() ? { min: row.min.trim() } : {}),
        ...(row.kind === 'number' && row.max.trim() ? { max: row.max.trim() } : {}),
        ...(row.kind === 'value_list' && row.valueList ? { value_list: row.valueList } : {}),
      })
    }
    await stageModel('model.attach_attribute', attachArgs(key))
  }

  const updateRow = async (original: AttributeTableRow, row: AttributeTableRow) => {
    const patch: Json = {}
    const nextKey = row.key.trim()
    const canRenameKey = !original.standard && original.id !== keyAttribute
    if (canRenameKey && nextKey && nextKey !== original.key) {
      await stageModel('model.rename_attribute_key', { key: original.key, new_key: nextKey })
    }
    const key = canRenameKey && nextKey ? nextKey : original.key
    const label = row.label.trim()
    if (label && label !== original.label) patch.label = label
    if (row.kind !== original.kind) {
      patch.kind = row.kind
      if (row.kind !== 'number' && row.kind !== 'range') patch.clear_unit = true
    }
    const unitKind = row.kind === 'number' || row.kind === 'range'
    if (unitKind && row.unit !== original.unit) {
      if (row.unit) patch.unit = row.unit
      else patch.clear_unit = true
    }
    if (row.required !== original.required) patch.required = row.required
    if (row.showByDefault !== original.showByDefault) patch.show_by_default = row.showByDefault
    if (row.languages !== original.languages) patch.languages = row.languages
    if (row.searchable !== original.searchable) patch.searchable = row.searchable
    if (row.filterable !== original.filterable) patch.filterable = row.filterable
    if (row.sortable !== original.sortable) patch.sortable = row.sortable
    if (row.multiple !== original.multiple) patch.multiple = row.multiple
    if (row.kind === 'number') {
      if (row.min !== original.min) {
        if (row.min.trim()) patch.min = row.min.trim()
        else if (original.min) patch.clear_min = true
      }
      if (row.max !== original.max) {
        if (row.max.trim()) patch.max = row.max.trim()
        else if (original.max) patch.clear_max = true
      }
    }
    if (row.kind === 'value_list' && row.valueList !== original.valueList) {
      if (row.valueList) patch.value_list = row.valueList
      else if (original.valueList) patch.clear_value_list = true
    }
    if (Object.keys(patch).length > 0) await stageModel('model.update_attribute', { key, ...patch })
  }

  const reorderRows = async () => {
    if (selection.kind !== 'type') return
    const order = (draftRows as Record<string, unknown>)[ROW_ORDER_KEY]
    if (!Array.isArray(order)) return
    const byId = new Map<string, AttributeTableRow>()
    for (const row of rows) byId.set(row.id, draftRows[row.id] ?? row)
    for (const [id, row] of Object.entries(draftRows)) if (!byId.has(id)) byId.set(id, row)
    const seen = new Set<string>()
    const desired: AttributeTableRow[] = []
    for (const id of order) {
      if (typeof id !== 'string') continue
      const row = byId.get(id)
      if (!row || seen.has(row.id)) continue
      seen.add(row.id)
      desired.push(row)
    }
    for (const row of rows) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      desired.push(draftRows[row.id] ?? row)
    }
    for (const row of Object.values(draftRows)) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      desired.push(row)
    }
    const attributes = desired.map((row) => row.key.trim() || attributeKey(row.label)).filter(Boolean)
    if (attributes.length === 0) return
    const current = rows.filter((row) => !row.inherited).map((row) => row.key)
    const existing = attributes.filter((key) => current.includes(key))
    if (existing.join('\u0000') === current.join('\u0000')) return
    await stageModel('model.reorder_type_attributes', { type_key: selection.typeKey, attributes })
  }

  const save = async () => {
    setMessage('')
    try {
      const existing = new Map(rows.map((row) => [row.id, row]))
      for (const row of Object.values(draftRows)) {
        const original = existing.get(row.id)
        if (original) await updateRow(original, row)
        else await createRow(row)
      }
      await reorderRows()
      setDraftRows({})
      await queryClient.invalidateQueries({ queryKey: ['model-draft'] })
      requestReview()
    } catch (reason) {
      setMessage(errorText(reason))
    }
  }

  const columns: Array<StandardColumn<AttributeTableRow>> = [
    {
      id: 'label',
      header: copy.attributeName,
      editable: true,
      truncate: true,
      read: (row) => row.label,
      write: (row, value) => ({ ...row, label: value }),
      cellTestId: (row) => `attr-label-${row.key || row.id}`,
    },
    {
      id: 'key',
      header: copy.key,
      editable: true,
      truncate: true,
      read: (row) => row.key,
      write: (row, value) => ({ ...row, key: value }),
      cellTestId: (row) => `attr-key-${row.key || row.id}`,
      display: (row) => {
        const locked = row.standard || row.id === keyAttribute
        return (
          <span className={locked ? 'attr-key-lock' : undefined} data-attr={row.key || undefined} title={row.standard ? copy.standardFlag : undefined}>
            {locked ? <Lock size={12} aria-hidden="true" /> : null}
            {row.key || '—'}
          </span>
        )
      },
    },
    {
      id: 'kind',
      header: copy.attributeType,
      type: 'enum',
      editable: true,
      options: KINDS.map(([value, label]) => ({ value, label })),
      read: (row) => row.kind,
      write: (row, value) => ({
        ...row,
        kind: value,
        ...(value === 'number' || value === 'range' ? {} : { unit: '', min: '', max: '', valueList: '' }),
      }),
      display: (row) => kindLabel(row.kind),
    },
    {
      id: 'unit',
      header: copy.unit,
      type: 'enum',
      editable: true,
      options: [{ value: 'none', label: copy.noUnit }, ...families.map((family) => ({ value: family, label: family }))],
      read: (row) => row.unit || 'none',
      write: (row, value) => ({ ...row, unit: value === 'none' ? '' : value }),
      display: (row) => row.unit || '—',
    },
    {
      id: 'required',
      header: copy.required,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      read: (row) => row.required,
      write: (row, value) => ({ ...row, required: value === 'true' }),
    },
    {
      id: 'showByDefault',
      header: copy.showByDefault,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      read: (row) => row.showByDefault,
      write: (row, value) => ({ ...row, showByDefault: value === 'true' }),
    },
    {
      id: 'languages',
      header: copy.languages,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      read: (row) => row.languages,
      write: (row, value) => ({ ...row, languages: value === 'true' }),
    },
    {
      id: 'searchable',
      header: copy.searchable,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      read: (row) => row.searchable,
      write: (row, value) => ({ ...row, searchable: value === 'true' }),
    },
  ]

  if (selection.kind === 'group') {
    columns.push({
      id: 'from',
      header: copy.from,
      type: 'readonly',
      truncate: true,
      read: (row) => (row.fromKey ? `${copy.fromSource} ${structureCaption(row.fromKey, defs)}` : ''),
      display: (row) => row.fromKey
        ? <span data-testid="attribute-from">{copy.fromSource} {structureCaption(row.fromKey, defs)}</span>
        : <span>—</span>,
    })
  }

  columns.push({
    id: 'menu',
    header: copy.more,
    type: 'readonly',
    width: 48,
    read: () => '',
    display: (row) => {
      if (row.inherited) return null
      const canChange = !row.standard && row.id !== keyAttribute
      return (
        <AttributeMenu
          row={row}
          lists={lists}
          onPatch={(change) => patch(row, change)}
          onDetach={canChange ? () => { void stageRemove(row, false) } : undefined}
          onDelete={canChange ? () => { void stageRemove(row, true) } : undefined}
        />
      )
    },
  })

  const title = selection.kind === 'type'
    ? objectTypes(defs, uiLanguage).find((item) => item.key === selection.typeKey)?.label ?? selection.typeKey
    : structureCaption(selection.group, defs, selection.kind === 'group' ? selection.structure : undefined)

  return (
    <div data-testid="data-model" className="model-attributes">
      <div className="attr-title">
        <span>{title}</span>
      </div>
      {selection.kind === 'type' ? (
        <>
          <TypeNameFields
            defs={defs}
            typeKey={selection.typeKey}
            onError={setMessage}
            onSave={(patchValue) => {
              setMessage('')
              void stageModel('model.update_type', { key: selection.typeKey, language: uiLanguage, ...patchValue })
                .catch((reason: unknown) => setMessage(errorText(reason)))
            }}
          />
          <AllowedTrees defs={defs} typeKey={selection.typeKey} onError={setMessage} />
        </>
      ) : null}
      <StandardEditableTable
        key={selectionKey}
        testId="attribute-table"
        columns={columns}
        rows={rows}
        draftRows={draftRows}
        onDraftRowsChange={setDraftRows}
        onNewRow={() => run('new')}
        newRowLabel={copy.newAttribute}
        filterValue={filter}
        onFilterChange={setFilter}
        emptyLabel={copy.noAttributesMatch}
        getRowTestId={(row) => (row.inherited ? 'attribute-row-inherited' : 'attribute-row')}
        getRowKeyAttr={(row) => row.key || row.id}
        rowFlags={(row) => ({
          fixed: selection.kind === 'type' && row.standard,
          readOnly: row.inherited,
        })}
        reorderable={selection.kind === 'type'}
        canEdit={(row, column) => {
          if (row.inherited) return false
          if (column.id === 'key' && (row.standard || row.id === keyAttribute)) return false
          if (column.id === 'unit' && row.kind !== 'number' && row.kind !== 'range') return false
          if (column.id === 'languages' && row.kind !== 'text') return false
          return true
        }}
        activeRowId={activeRowId}
        onActivateRow={(row) => {
          setActiveRowId(row.id)
          if (row.key) setModelFocus({ kind: 'attribute', key: row.key })
        }}
        onReviewAndSave={save}
      />
      <CreateDialog
        open={createOpen}
        title={copy.newAttribute}
        description={copy.createNameHint}
        fields={[
          { id: 'name', label: copy.name, value: createName, testId: 'new-name', autoFocus: true },
          {
            id: 'kind',
            label: copy.attributeType,
            value: createKind,
            testId: 'new-type',
            options: KINDS.map(([value, label]) => ({ value, label })),
          },
        ]}
        onField={(id, value) => {
          if (id === 'name') setCreateName(value)
          else setCreateKind(value)
        }}
        onClose={() => setCreateOpen(false)}
        onSubmit={async () => {
          const label = requireText(createName)
          const key = attributeKey(label)
          if (!key) throw new Error(copy.validation)
          await createRow({
            id: key,
            key,
            label,
            kind: createKind,
            unit: '',
            required: false,
            showByDefault: true,
            languages: createKind === 'text',
            searchable: false,
            filterable: false,
            sortable: false,
            inherited: false,
            standard: false,
            multiple: false,
            min: '',
            max: '',
            valueList: '',
          })
          setPendingKey(key)
          void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
        }}
      />
      {message ? <p className="error">{message}</p> : null}
    </div>
  )
}

function AllowedTrees({ defs, typeKey, onError }: { defs: Json | undefined; typeKey: string; onError: (message: string) => void }) {
  const raw = ((defs?.types as Json[]) ?? []).find((item) => String(item.key) === typeKey)
  const selected = new Set(Array.isArray(raw?.structures) ? raw.structures.map((id) => String(id)) : [])
  const structures = ((defs?.structures as Json[]) ?? [])
  const [focus, setFocus] = useState(false)
  useEffect(() => {
    const open = () => setFocus(true)
    window.addEventListener('braian-allowed-trees', open)
    return () => window.removeEventListener('braian-allowed-trees', open)
  }, [])
  const save = async (next: string[]) => {
    onError('')
    try {
      await stageModel('model.set_structures', { type_key: typeKey, structures: next })
      requestReview()
    } catch (reason) {
      onError(errorText(reason))
    }
  }
  return (
    <fieldset className="type-names" data-testid="allowed-trees">
      <legend title={copy.allowedTreesHint}>{copy.allowedTrees.replace('…', '')}</legend>
      <p className="hint">{copy.allowedTreesHint}</p>
      {structures.map((structure, index) => {
        const id = String(structure.id ?? structure.key)
        const checked = selected.has(id) || selected.has(String(structure.key))
        const label = textValue(structure.labels as Json, uiLanguage) || String(structure.key)
        return (
          <label key={id}>
            <input
              type="checkbox"
              autoFocus={focus && index === 0}
              checked={checked}
              onChange={(event) => {
                const next = new Set(selected)
                if (event.target.checked) next.add(id)
                else next.delete(id)
                void save([...next])
              }}
            />
            {label}
          </label>
        )
      })}
    </fieldset>
  )
}

function indefiniteHere(name: string) {
  const lower = name.toLowerCase()
  const article = /^[aeiou]/i.test(lower) ? 'An' : 'A'
  return `${article} ${lower} here gets these fields`
}

function TypeNameFields({
  defs,
  typeKey,
  onError,
  onSave,
}: {
  defs: Json | undefined
  typeKey: string
  onError: (message: string) => void
  onSave: (patch: Json) => void
}) {
  const row = objectTypes(defs, uiLanguage).find((item) => item.key === typeKey)
  const raw = ((defs?.types as Json[]) ?? []).find((item) => String(item.key) === typeKey)
  const singularValue = textValue(raw?.singular, uiLanguage) || row?.singular || ''
  const pluralValue = textValue(raw?.plural, uiLanguage) || row?.plural || ''
  return (
    <div className="type-names">
      <label>
        {copy.singular}
        <input
          aria-label={copy.singular}
          defaultValue={singularValue}
          key={`${typeKey}:singular:${singularValue}`}
          onBlur={(event) => {
            const next = event.target.value.trim()
            if (next !== singularValue) onSave({ singular: next })
          }}
        />
      </label>
      <label>
        {copy.plural}
        <input
          aria-label={copy.plural}
          defaultValue={pluralValue}
          key={`${typeKey}:plural:${pluralValue}`}
          onBlur={(event) => {
            const next = event.target.value.trim()
            if (next !== pluralValue) onSave({ plural: next })
          }}
        />
      </label>
      <label>
        {copy.key}
        <input
          aria-label={copy.key}
          data-testid={`type-key-${typeKey}`}
          defaultValue={typeKey}
          key={`${typeKey}:key`}
          onBlur={(event) => {
            const next = event.target.value.trim()
            if (next && next !== typeKey) {
              onError('')
              void propose('model.rename_type_key', { key: typeKey, new_key: next })
                .catch((reason: unknown) => onError(errorText(reason)))
            }
          }}
        />
      </label>
    </div>
  )
}

function typeName(defs: Json | undefined, key: string) {
  return objectTypes(defs, uiLanguage).find((item) => item.key === key)?.label ?? structureCaption(key, defs)
}

const STANDARD_ATTRIBUTE_IDS = new Set([
  "018f0000-0000-7000-8000-000000000100",
  "018f0000-0000-7000-8000-000000000101",
  "018f0000-0000-7000-8000-00000000a003",
  "018f0000-0000-7000-8000-00000000a004",
  "018f0000-0000-7000-8000-00000000a005",
])

function standardAttribute(id: string) {
  return STANDARD_ATTRIBUTE_IDS.has(id)
}

function keyAttributeOf(defs: Json | undefined, selection: ModelSelection | null) {
  if (!defs || selection?.kind !== 'type') return ''
  const objectType = ((defs.types as Json[]) ?? []).find((item) => String(item.key) === selection.typeKey)
  return String(objectType?.key_attribute ?? '')
}

function kindLabel(kind: string) {
  return KINDS.find(([value]) => value === kind)?.[1] ?? kind
}

function ImpactNote() {
  const queryClient = useQueryClient()
  const [attribute, setAttribute] = useState('status')
  const [result, setResult] = useState<Json | null>(null)
  const [error, setError] = useState('')
  return (
    <div data-testid="data-model">
      <p className="hint">{copy.reviewChange}</p>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          setError('')
          void api.post('/v1/impact', { body: { remove_attribute: attribute } })
            .then((body) => {
              setResult(body)
              void queryClient.invalidateQueries({ queryKey: ['definitions'] })
            })
            .catch((reason: unknown) => {
              setError(writeErrorMessage(reason) ?? copy.validation)
            })
        }}
      >
        <input data-testid="impact-attribute" value={attribute} onChange={(event) => setAttribute(event.target.value)} />
        <button type="submit" data-testid="impact-run">{copy.calculate}</button>
      </form>
      {error ? <p className="error" data-testid="impact-error">{error}</p> : null}
      {result ? (
        <div data-testid="impact-result">
          <p>{copy.affected}: {formatCount(result.affected_objects)}</p>
          <p>{copy.samples}: {((result.samples as Json[]) ?? []).map((item) => String(item.key)).join(', ')}</p>
          {((result.jobs as Json[]) ?? []).map((job) => (
            <p key={String(job.key)}>{String(job.title)}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
