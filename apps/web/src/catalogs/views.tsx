import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCatalogsQuery } from '../catalog-list'
import { useState, type ReactNode } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { copy, uiLanguage } from '../i18n'
import { ApiError, api, type Json } from '../api'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { linkHitFromDocument, type LinkHit } from '../link-choices'
import { messageFromErrorBody, writeErrorMessage } from '../write-error'

type CatalogRow = { key: string; name: string; kind: string; editable?: boolean }
type ProfileRow = { key: string; name: string; mode: string; revision?: number; spec?: Spec; source_catalog_id?: string }
type Spec = {
  match_attributes?: string[]
  master_key?: string
  attributes?: Array<{ source: string; target: string }>
  on_no_match?: string
  on_delete?: string
  owns_existence_for?: string[]
  structure?: string | null
}
type RunRow = {
  source_key?: string
  master_key?: string | null
  action?: string
  detail?: { values?: Record<string, unknown>; errors?: Array<{ attribute?: string; message?: string }> }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'include' })
  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<T>
}

async function sendJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        parsed = null
      }
    }
    const detail = messageFromErrorBody(parsed) || response.statusText || text || `HTTP ${response.status}`
    throw new ApiError(response.status, detail, parsed)
  }
  return response.json()
}

function failedWrite(reason: unknown, fallback: string) {
  return writeErrorMessage(reason) ?? fallback
}

function CatalogField({
  id,
  label,
  help,
  children,
}: {
  id: string
  label: string
  help?: string
  children: ReactNode
}) {
  return (
    <div className="catalog-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help ? <p className="catalog-field-help" id={`${id}-help`}>{help}</p> : null}
    </div>
  )
}

type OwnershipRule = { attribute: string; profiles: string[]; language?: string }
type OwnershipRow = { id: string; attribute: string; profiles: string; language?: string }

export function ownershipRowsFromRules(rules: OwnershipRule[]): OwnershipRow[] {
  return rules.map((rule, index) => ({
    id: `ownership-${index}`,
    attribute: rule.attribute,
    profiles: rule.profiles.join(', '),
    ...(rule.language ? { language: rule.language } : {}),
  }))
}

export function ownershipRulesFromRows(rows: OwnershipRow[]): OwnershipRule[] {
  return rows
    .map((row) => ({
      attribute: row.attribute.trim(),
      ...(row.language ? { language: row.language } : {}),
      profiles: row.profiles.split(',').map((profile) => profile.trim()).filter(Boolean),
    }))
    .filter((rule) => rule.attribute.length > 0)
}

function mergeModeLabel(mode: string) {
  if (mode === 'continuous') return copy.modeContinuous
  if (mode === 'manual') return copy.modeManual
  return mode
}

export function CatalogsView() {
  const queryClient = useQueryClient()
  const catalogs = useCatalogsQuery()
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [editable, setEditable] = useState(true)
  const [error, setError] = useState('')
  const create = useMutation({
    mutationFn: () => sendJson('/v1/catalogs', { key, name: name || key, kind: 'source', editable }),
    onSuccess: () => {
      setKey('')
      setName('')
      setError('')
      void queryClient.invalidateQueries({ queryKey: ['catalogs'] })
    },
    onError: (reason: unknown) => setError(failedWrite(reason, copy.catalogCreateFailed)),
  })
  const infer = useMutation({
    mutationFn: (catalog: string) => sendJson(`/v1/catalogs/${catalog}/infer`, { headers: [] }),
    onError: (reason: unknown) => setError(failedWrite(reason, copy.inferModelFailed)),
  })
  const cleanup = useMutation({
    mutationFn: (catalog: string) => sendJson(`/v1/catalogs/${catalog}/cleanup`, {}),
    onError: (reason: unknown) => setError(failedWrite(reason, copy.cleanupCatalogFailed)),
  })
  return (
    <div className="catalog-admin" data-testid="catalogs-view">
      <h2>{copy.catalogs}</h2>
      <ul>
        {(catalogs.data ?? []).map((row) => {
          const catalogKey = row.key || row.id || ''
          return (
          <li key={catalogKey}>
            <strong>{row.name}</strong> <span>{row.key}</span> <span>{row.kind}</span>
            {row.kind === 'source' && catalogKey ? (
              <span className="catalog-list-actions">
                <TooltipProvider delayDuration={400} disableHoverableContent>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="icon"
                        size="icon"
                        aria-label={copy.inferModel}
                        data-testid={`infer-${catalogKey}`}
                        onClick={() => infer.mutate(catalogKey)}
                      >
                        <Sparkles aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{copy.inferModelHelp}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="icon"
                        size="icon"
                        aria-label={copy.cleanupCatalog}
                        data-testid={`cleanup-${catalogKey}`}
                        onClick={() => cleanup.mutate(catalogKey)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{copy.cleanupCatalogHelp}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            ) : null}
          </li>
          )
        })}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <h3>{copy.newCatalog}</h3>
        <CatalogField id="catalog-key" label={copy.catalogKey} help={copy.catalogKeyHint}>
          <input id="catalog-key" data-testid="catalog-key" value={key} onChange={(event) => setKey(event.target.value)} placeholder="sap" />
        </CatalogField>
        <CatalogField id="catalog-name" label={copy.catalogName} help={copy.catalogNameHint}>
          <input id="catalog-name" data-testid="catalog-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="SAP ERP" />
        </CatalogField>
        <div className="catalog-field">
          <label className="catalog-check" htmlFor="catalog-editable">
            <input
              id="catalog-editable"
              type="checkbox"
              checked={editable}
              onChange={(event) => setEditable(event.target.checked)}
            />
            {copy.catalogEditable}
          </label>
          <p className="catalog-field-help">{copy.catalogEditableHint}</p>
        </div>
        <button type="submit" className="primary">{copy.save}</button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {infer.data ? <p data-testid="infer-result">{JSON.stringify(infer.data)}</p> : null}
    </div>
  )
}

const emptySpec = (): Spec => ({
  match_attributes: ['number'],
  master_key: 'number',
  attributes: [{ source: 'brand', target: 'brand' }],
  on_no_match: 'skip',
  on_delete: 'ignore',
  owns_existence_for: [],
})

export function MergeProfilesView() {
  const queryClient = useQueryClient()
  const profiles = useQuery({ queryKey: ['merge-profiles'], queryFn: () => getJson<ProfileRow[]>('/v1/merge/profiles') })
  const catalogs = useCatalogsQuery()
  const [draft, setDraft] = useState({
    key: '',
    name: '',
    source_catalog: 'sap',
    mode: 'manual',
    schedule: '',
    spec: emptySpec(),
  })
  const [rows, setRows] = useState<RunRow[]>([])
  const [error, setError] = useState('')
  const save = useMutation({
    mutationFn: () =>
      sendJson('/v1/merge/profiles', {
        key: draft.key,
        name: draft.name || draft.key,
        source_catalog: draft.source_catalog,
        mode: draft.mode,
        schedule: draft.schedule || null,
        spec: draft.spec,
      }),
    onSuccess: () => {
      setError('')
      void queryClient.invalidateQueries({ queryKey: ['merge-profiles'] })
    },
    onError: (reason: unknown) => setError(failedWrite(reason, copy.saveProfileFailed)),
  })
  const run = useMutation({
    mutationFn: (dry: boolean) => sendJson(`/v1/merge/profiles/${draft.key}/run`, { dry_run: dry }),
    onSuccess: (body: { rows?: RunRow[] }) => {
      setRows(body.rows ?? [])
      setError('')
    },
    onError: (reason: unknown) => setError(failedWrite(reason, copy.runProfileFailed)),
  })
  const maps = (draft.spec.attributes ?? []).map((row) => `${row.source}=${row.target}`).join('\n')
  return (
    <div className="catalog-admin" data-testid="merge-profiles-view">
      <h2>{copy.mergeProfiles}</h2>
      <ul>
        {(profiles.data ?? []).map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  key: row.key,
                  name: row.name,
                  source_catalog: draft.source_catalog,
                  mode: row.mode,
                  schedule: '',
                  spec: { ...emptySpec(), ...row.spec },
                })
              }
            >
              {row.name}
            </button>
            <span>{mergeModeLabel(row.mode)}</span>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <CatalogField id="profile-key" label={copy.profileKey}>
          <input
            id="profile-key"
            data-testid="profile-key"
            value={draft.key}
            onChange={(event) => setDraft({ ...draft, key: event.target.value })}
            placeholder="sap-brand"
          />
        </CatalogField>
        <CatalogField id="profile-name" label={copy.profileName}>
          <input
            id="profile-name"
            data-testid="profile-name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="SAP brand"
          />
        </CatalogField>
        <CatalogField id="profile-source-catalog" label={copy.sourceCatalog}>
          <select
            id="profile-source-catalog"
            data-testid="profile-source-catalog"
            value={draft.source_catalog}
            onChange={(event) => setDraft({ ...draft, source_catalog: event.target.value })}
          >
            {(catalogs.data ?? []).filter((row) => row.kind === 'source').map((row) => (
              <option key={row.key} value={row.key}>{row.name}</option>
            ))}
          </select>
        </CatalogField>
        <CatalogField id="profile-mode" label={copy.mergeMode} help={copy.mergeModeHint}>
          <select
            id="profile-mode"
            data-testid="profile-mode"
            value={draft.mode}
            onChange={(event) => setDraft({ ...draft, mode: event.target.value })}
          >
            <option value="manual">{copy.modeManual}</option>
            <option value="continuous">{copy.modeContinuous}</option>
          </select>
        </CatalogField>
        <CatalogField id="profile-schedule" label={copy.schedule} help={copy.scheduleHint}>
          <input
            id="profile-schedule"
            data-testid="profile-schedule"
            value={draft.schedule}
            placeholder="* * * * *"
            onChange={(event) => setDraft({ ...draft, schedule: event.target.value })}
          />
        </CatalogField>
        <CatalogField id="profile-match-attribute" label={copy.matchAttribute} help={copy.matchAttributeHint}>
          <input
            id="profile-match-attribute"
            data-testid="profile-match-attribute"
            value={draft.spec.match_attributes?.[0] ?? ''}
            onChange={(event) => setDraft({ ...draft, spec: { ...draft.spec, match_attributes: [event.target.value] } })}
          />
        </CatalogField>
        <CatalogField id="profile-master-key" label={copy.masterKey} help={copy.masterKeyHint}>
          <input
            id="profile-master-key"
            data-testid="profile-master-key"
            value={draft.spec.master_key ?? ''}
            onChange={(event) => setDraft({ ...draft, spec: { ...draft.spec, master_key: event.target.value } })}
          />
        </CatalogField>
        <CatalogField id="profile-attribute-map" label={copy.attributeMap} help={copy.attributeMapHint}>
          <textarea
            id="profile-attribute-map"
            data-testid="profile-attribute-map"
            value={maps}
            onChange={(event) =>
              setDraft({
                ...draft,
                spec: {
                  ...draft.spec,
                  attributes: event.target.value
                    .split('\n')
                    .map((line) => line.split('='))
                    .filter((pair) => pair[0] && pair[1])
                    .map(([source, target]) => ({ source: source.trim(), target: target.trim() })),
                },
              })
            }
          />
        </CatalogField>
        <CatalogField id="profile-on-no-match" label={copy.onNoMatch} help={copy.onNoMatchHint}>
          <select
            id="profile-on-no-match"
            data-testid="profile-on-no-match"
            value={draft.spec.on_no_match ?? 'skip'}
            onChange={(event) => setDraft({ ...draft, spec: { ...draft.spec, on_no_match: event.target.value } })}
          >
            <option value="skip">{copy.onNoMatchSkip}</option>
            <option value="create">{copy.onNoMatchCreate}</option>
          </select>
        </CatalogField>
        <CatalogField id="profile-on-delete" label={copy.onDelete} help={copy.onDeleteHint}>
          <select
            id="profile-on-delete"
            data-testid="profile-on-delete"
            value={draft.spec.on_delete ?? 'ignore'}
            onChange={(event) => setDraft({ ...draft, spec: { ...draft.spec, on_delete: event.target.value } })}
          >
            <option value="ignore">{copy.onDeleteIgnore}</option>
            <option value="propagate">{copy.onDeletePropagate}</option>
          </select>
        </CatalogField>
        <CatalogField id="profile-owns-existence" label={copy.ownsExistence} help={copy.ownsExistenceHint}>
          <input
            id="profile-owns-existence"
            data-testid="profile-owns-existence"
            placeholder="article"
            value={(draft.spec.owns_existence_for ?? []).join(',')}
            onChange={(event) =>
              setDraft({
                ...draft,
                spec: {
                  ...draft.spec,
                  owns_existence_for: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                },
              })
            }
          />
        </CatalogField>
        <div className="catalog-form-actions">
          <button type="submit" className="primary">{copy.saveProfile}</button>
          <button type="button" onClick={() => run.mutate(true)}>{copy.dryRun}</button>
          <button type="button" onClick={() => run.mutate(false)}>{copy.runMerge}</button>
        </div>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <DiffTable rows={rows} />
    </div>
  )
}

export function OwnershipView() {
  const queryClient = useQueryClient()
  const rules = useQuery({ queryKey: ['ownership'], queryFn: () => getJson<OwnershipRule[]>('/v1/merge/ownership') })
  const [rows, setRows] = useState<OwnershipRow[] | null>(null)
  const [nextRow, setNextRow] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const draftRows = rows ?? ownershipRowsFromRules(rules.data ?? [])
  const confirmedRules = ownershipRulesFromRows(draftRows)
  const save = useMutation({
    mutationFn: () => sendJson('/v1/merge/ownership', confirmedRules),
    onSuccess: () => {
      setRows(null)
      setError('')
      void queryClient.invalidateQueries({ queryKey: ['ownership'] })
    },
    onError: (reason: unknown) => setError(failedWrite(reason, copy.saveRulesFailed)),
  })
  const updateRow = (id: string, patch: Partial<OwnershipRow>) => {
    setRows(draftRows.map((row) => row.id === id ? { ...row, ...patch } : row))
  }
  const addRow = () => {
    const id = `ownership-new-${nextRow}`
    setNextRow((value) => value + 1)
    setRows([...draftRows, { id, attribute: '', profiles: '' }])
  }
  return (
    <div className="catalog-admin" data-testid="ownership-view">
      <h2>{copy.ownership}</h2>
      <p>{copy.ownershipHint}</p>
      <div className="ownership-editor" data-testid="ownership-editor">
        {draftRows.length === 0 ? <p className="catalog-field-help">{copy.ownershipEmpty}</p> : null}
        {draftRows.map((row, index) => (
          <div key={row.id} className="ownership-row" data-testid="ownership-row">
            <CatalogField id={`ownership-attribute-${row.id}`} label={copy.ownershipAttribute}>
              <input
                id={`ownership-attribute-${row.id}`}
                data-testid={`ownership-attribute-${index}`}
                value={row.attribute}
                onChange={(event) => updateRow(row.id, { attribute: event.target.value })}
              />
            </CatalogField>
            <CatalogField
              id={`ownership-profiles-${row.id}`}
              label={copy.ownershipProfiles}
              help={copy.ownershipProfilesHint}
            >
              <input
                id={`ownership-profiles-${row.id}`}
                data-testid={`ownership-profiles-${index}`}
                value={row.profiles}
                placeholder="sap-brand"
                onChange={(event) => updateRow(row.id, { profiles: event.target.value })}
              />
            </CatalogField>
            <Button
              type="button"
              variant="icon"
              size="icon"
              className="ownership-remove"
              aria-label={copy.ownershipRemoveRule}
              data-testid={`ownership-remove-${index}`}
              onClick={() => setRows(draftRows.filter((item) => item.id !== row.id))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="ghost" data-testid="ownership-add-rule" onClick={addRow}>
            {copy.ownershipAddRule}
          </Button>
        </div>
      </div>
      <div className="catalog-form-actions">
        <Button
          type="button"
          variant="primary"
          data-testid="ownership-save"
          onClick={() => setConfirmOpen(true)}
        >
          {copy.saveRules}
        </Button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <Dialog open={confirmOpen} onOpenChange={(next) => { if (!next) setConfirmOpen(false) }}>
        <DialogContent
          data-testid="ownership-confirm"
          aria-label={copy.saveRules}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <DialogTitle asChild>
            <p>{copy.ownershipConfirm.replace('{count}', String(confirmedRules.length))}</p>
          </DialogTitle>
          <div className="dialog-actions">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>{copy.cancel}</Button>
            <Button
              type="button"
              variant="primary"
              data-testid="ownership-confirm-save"
              onClick={() => {
                setConfirmOpen(false)
                save.mutate()
              }}
            >
              {copy.saveRules}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type MergeChoice = { id: string; key: string; name: string }

export function mergeChoiceLabel(choice: MergeChoice) {
  if (choice.key && choice.name && choice.key !== choice.name) return `${choice.key} · ${choice.name}`
  return choice.name || choice.key || choice.id
}

function mergeValueText(value: unknown) {
  if (value == null) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 28 ? `${text.slice(0, 28)}…` : text
}

export function mergeValuesSummary(values: Record<string, unknown>) {
  const entries = Object.entries(values)
  if (entries.length === 0) return copy.noValue
  const shown = entries.slice(0, 3).map(([key, value]) => `${key}: ${mergeValueText(value)}`)
  const extra = entries.length - shown.length
  return extra > 0 ? `${shown.join(' · ')} +${extra}` : shown.join(' · ')
}

function MergeObjectPicker({
  label,
  testId,
  choice,
  onChoose,
}: {
  label: string
  testId: string
  choice: MergeChoice | null
  onChoose: (choice: MergeChoice) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const found = useQuery({
    queryKey: ['merge-object-search', query],
    queryFn: () => api.get('/v1/search', { params: { query: { q: query.trim(), per_page: 8, lang: uiLanguage } } }),
    enabled: open && query.trim().length > 1,
  })
  const hits = (((found.data?.hits as Json[]) ?? [])
    .map((hit) => linkHitFromDocument((hit.document as Json) ?? hit))
    .filter((hit): hit is LinkHit => hit != null))
  const pick = (hit: LinkHit) => {
    onChoose({ id: hit.id, key: hit.key, name: hit.name })
    setQuery('')
    setOpen(false)
  }
  return (
    <div className="merge-picker">
      <label htmlFor={`${testId}-input`}>{label}</label>
      <div className="ref">
        <input
          id={`${testId}-input`}
          data-testid={testId}
          value={open ? query : choice ? mergeChoiceLabel(choice) : ''}
          placeholder={copy.pickObject}
          autoComplete="off"
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => setQuery(event.target.value)}
        />
        {open && query.trim().length > 1 ? (
          <div className="ref-menu" role="listbox" data-testid={`${testId}-results`}>
            {hits.length === 0 && !found.isFetching ? (
              <p data-testid={`${testId}-empty`}>{copy.noResultsFor.replace('{query}', query.trim())}</p>
            ) : null}
            {hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                data-testid={`${testId}-option`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(hit)}
              >
                {mergeChoiceLabel(hit)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function MergeRunsView() {
  const profiles = useQuery({ queryKey: ['merge-profiles'], queryFn: () => getJson<ProfileRow[]>('/v1/merge/profiles') })
  const [key, setKey] = useState('sap-brand')
  const [source, setSource] = useState<MergeChoice | null>(null)
  const [master, setMaster] = useState<MergeChoice | null>(null)
  const [error, setError] = useState('')
  const rows = useQuery({
    queryKey: ['merge-rows', key],
    queryFn: () => getJson<RunRow[]>(`/v1/merge/profiles/${key}/rows`),
    enabled: Boolean(key),
  })
  const sourceId = source?.id ?? ''
  const masterId = master?.id ?? ''
  const link = useMutation({
    mutationFn: (remove: boolean) =>
      remove
        ? sendJson('/v1/merge/links/remove', { profile: key, source_object_id: sourceId })
        : sendJson('/v1/merge/links', { profile: key, source_object_id: sourceId, master_object_id: masterId }),
    onSuccess: () => setError(''),
    onError: (reason: unknown) => setError(failedWrite(reason, copy.updateLinkFailed)),
  })
  return (
    <div className="catalog-admin" data-testid="merge-runs-view">
      <h2>{copy.mergeRuns}</h2>
      <select aria-label={copy.profile} value={key} onChange={(event) => setKey(event.target.value)}>
        {(profiles.data ?? []).map((row) => (
          <option key={row.key} value={row.key}>{row.name}</option>
        ))}
      </select>
      <DiffTable rows={rows.data ?? []} />
      <div className="merge-link-form">
        <MergeObjectPicker label={copy.sourceObject} testId="merge-source-picker" choice={source} onChoose={setSource} />
        <MergeObjectPicker label={copy.masterObject} testId="merge-master-picker" choice={master} onChoose={setMaster} />
        <button type="button" className="btn-ghost" onClick={() => link.mutate(false)}>{copy.linkObjects}</button>
        <button type="button" className="btn-ghost" onClick={() => link.mutate(true)}>{copy.unlinkObjects}</button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}

function MergeValues({ values }: { values: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const summary = mergeValuesSummary(values)
  return (
    <div className="merge-values">
      <button
        type="button"
        className="merge-values-summary"
        data-testid="merge-values-summary"
        aria-expanded={expanded}
        aria-label={`${expanded ? copy.collapse : copy.expand} ${copy.mergeValues}`}
        title={summary}
        onClick={() => setExpanded((current) => !current)}
      >
        {summary}
      </button>
      {expanded ? (
        <pre className="merge-values-expand" data-testid="merge-values-expand">{JSON.stringify(values, null, 2)}</pre>
      ) : null}
    </div>
  )
}

export function DiffTable({ rows }: { rows: RunRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="import-preview merge-preview" data-testid="merge-preview">
      <div className="merge-row merge-header" data-testid="merge-header">
        <span>{copy.mergeAction}</span>
        <span>{copy.mergeSource}</span>
        <span>{copy.mergeMaster}</span>
        <span>{copy.mergeValues}</span>
        <span>{copy.mergeErrors}</span>
      </div>
      {rows.map((row, index) => {
        const errors = (row.detail?.errors ?? []).map((error) => error.message).join('; ')
        return (
          <div key={`${row.source_key}-${index}`} className={`merge-row ${row.action ?? ''}`} data-testid={`merge-row-${row.action}`}>
            <span>{row.action}</span>
            <span title={row.source_key}>{row.source_key}</span>
            <span title={row.master_key ?? ''}>{row.master_key ?? ''}</span>
            <MergeValues values={row.detail?.values ?? {}} />
            <span title={errors}>{errors}</span>
          </div>
        )
      })}
    </div>
  )
}
