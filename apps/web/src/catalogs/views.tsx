import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCatalogsQuery } from '../catalog-list'
import { useState } from 'react'
import { copy } from '../i18n'

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
  if (!response.ok) throw new Error(await response.text())
  return response.json()
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
    onError: (reason: Error) => setError(reason.message),
  })
  const infer = useMutation({
    mutationFn: (catalog: string) => sendJson(`/v1/catalogs/${catalog}/infer`, { headers: [] }),
    onError: (reason: Error) => setError(reason.message),
  })
  const cleanup = useMutation({
    mutationFn: (catalog: string) => sendJson(`/v1/catalogs/${catalog}/cleanup`, {}),
    onError: (reason: Error) => setError(reason.message),
  })
  return (
    <div className="catalog-admin" data-testid="catalogs-view">
      <h2>{copy.catalogs}</h2>
      <ul>
        {(catalogs.data ?? []).map((row) => (
          <li key={row.key}>
            <strong>{row.name}</strong> <span>{row.key}</span> <span>{row.kind}</span>
            {row.kind === 'source' ? (
              <>
                <button type="button" onClick={() => infer.mutate(row.key)}>{copy.inferModel}</button>
                <button type="button" onClick={() => cleanup.mutate(row.key)}>{copy.cleanupCatalog}</button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <h3>{copy.newCatalog}</h3>
        <input aria-label="Catalog key" value={key} onChange={(event) => setKey(event.target.value)} placeholder="sap" />
        <input aria-label="Catalog name" value={name} onChange={(event) => setName(event.target.value)} placeholder="SAP ERP" />
        <label>
          <input type="checkbox" checked={editable} onChange={(event) => setEditable(event.target.checked)} /> editable
        </label>
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
    onError: (reason: Error) => setError(reason.message),
  })
  const run = useMutation({
    mutationFn: (dry: boolean) => sendJson(`/v1/merge/profiles/${draft.key}/run`, { dry_run: dry }),
    onSuccess: (body: { rows?: RunRow[] }) => {
      setRows(body.rows ?? [])
      setError('')
    },
    onError: (reason: Error) => setError(reason.message),
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
            <span>{row.mode}</span>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <input aria-label="Profile key" value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} placeholder="sap-brand" />
        <input aria-label="Profile name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="SAP brand" />
        <select aria-label="Source catalog" value={draft.source_catalog} onChange={(event) => setDraft({ ...draft, source_catalog: event.target.value })}>
          {(catalogs.data ?? []).filter((row) => row.kind === 'source').map((row) => (
            <option key={row.key} value={row.key}>{row.name}</option>
          ))}
        </select>
        <select aria-label="Mode" value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value })}>
          <option value="manual">manual</option>
          <option value="continuous">continuous</option>
        </select>
        <input aria-label="Schedule" value={draft.schedule} placeholder="* * * * *" onChange={(event) => setDraft({ ...draft, schedule: event.target.value })} />
        <input
          aria-label="Match attribute"
          value={draft.spec.match_attributes?.[0] ?? ''}
          onChange={(event) => setDraft({ ...draft, spec: { ...draft.spec, match_attributes: [event.target.value] } })}
        />
        <input
          aria-label="Master key"
          value={draft.spec.master_key ?? ''}
          onChange={(event) => setDraft({ ...draft, spec: { ...draft.spec, master_key: event.target.value } })}
        />
        <textarea
          aria-label="Attribute map"
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
        <select
          aria-label="When nothing matches"
          value={draft.spec.on_no_match ?? 'skip'}
          onChange={(event) => setDraft({ ...draft, spec: { ...draft.spec, on_no_match: event.target.value } })}
        >
          <option value="skip">skip</option>
          <option value="create">create</option>
        </select>
        <select
          aria-label="When the source deletes"
          value={draft.spec.on_delete ?? 'ignore'}
          onChange={(event) => setDraft({ ...draft, spec: { ...draft.spec, on_delete: event.target.value } })}
        >
          <option value="ignore">ignore</option>
          <option value="propagate">propagate</option>
        </select>
        <input
          aria-label="Owns existence"
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
        <button type="submit" className="primary">{copy.saveProfile}</button>
        <button type="button" onClick={() => run.mutate(true)}>{copy.dryRun}</button>
        <button type="button" onClick={() => run.mutate(false)}>{copy.runMerge}</button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <DiffTable rows={rows} />
    </div>
  )
}

export function OwnershipView() {
  const rules = useQuery({ queryKey: ['ownership'], queryFn: () => getJson<Array<{ attribute: string; profiles: string[] }>>('/v1/merge/ownership') })
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const shown = text || JSON.stringify(rules.data ?? [], null, 2)
  const save = useMutation({
    mutationFn: () => sendJson('/v1/merge/ownership', JSON.parse(shown)),
    onSuccess: () => setError(''),
    onError: (reason: Error) => setError(reason.message),
  })
  return (
    <div className="catalog-admin" data-testid="ownership-view">
      <h2>{copy.ownership}</h2>
      <textarea aria-label="Ownership rules" value={shown} onChange={(event) => setText(event.target.value)} rows={12} />
      <p>{copy.ownershipHint}</p>
      <button
        type="button"
        className="primary"
        onClick={() => {
          let count = 0
          try {
            const parsed = JSON.parse(shown) as unknown
            count = Array.isArray(parsed) ? parsed.length : 0
          } catch {
            setError('Ownership rules must be a JSON list')
            return
          }
          if (!window.confirm(copy.ownershipConfirm.replace('{count}', String(count)))) return
          save.mutate()
        }}
      >
        {copy.saveRules}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}

export function MergeRunsView() {
  const profiles = useQuery({ queryKey: ['merge-profiles'], queryFn: () => getJson<ProfileRow[]>('/v1/merge/profiles') })
  const [key, setKey] = useState('sap-brand')
  const [sourceId, setSourceId] = useState('')
  const [masterId, setMasterId] = useState('')
  const [error, setError] = useState('')
  const rows = useQuery({
    queryKey: ['merge-rows', key],
    queryFn: () => getJson<RunRow[]>(`/v1/merge/profiles/${key}/rows`),
    enabled: Boolean(key),
  })
  const link = useMutation({
    mutationFn: (remove: boolean) =>
      remove
        ? sendJson('/v1/merge/links/remove', { profile: key, source_object_id: sourceId })
        : sendJson('/v1/merge/links', { profile: key, source_object_id: sourceId, master_object_id: masterId }),
    onSuccess: () => setError(''),
    onError: (reason: Error) => setError(reason.message),
  })
  return (
    <div className="catalog-admin" data-testid="merge-runs-view">
      <h2>{copy.mergeRuns}</h2>
      <select aria-label="Profile" value={key} onChange={(event) => setKey(event.target.value)}>
        {(profiles.data ?? []).map((row) => (
          <option key={row.key} value={row.key}>{row.name}</option>
        ))}
      </select>
      <DiffTable rows={rows.data ?? []} />
      <input aria-label={copy.sourceObjectId} value={sourceId} placeholder={copy.sourceObjectId} onChange={(event) => setSourceId(event.target.value)} />
      <input aria-label={copy.masterObjectId} value={masterId} placeholder={copy.masterObjectId} onChange={(event) => setMasterId(event.target.value)} />
      <button type="button" onClick={() => link.mutate(false)}>{copy.linkObjects}</button>
      <button type="button" onClick={() => link.mutate(true)}>{copy.unlinkObjects}</button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}

export function DiffTable({ rows }: { rows: RunRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="import-preview" data-testid="merge-preview">
      {rows.map((row, index) => (
        <div key={`${row.source_key}-${index}`} className={`import-row ${row.action ?? ''}`} data-testid={`merge-row-${row.action}`}>
          <span>{row.action}</span>
          <span>{row.source_key}</span>
          <span>{row.master_key ?? ''}</span>
          <span>{JSON.stringify(row.detail?.values ?? {})}</span>
          <span>{(row.detail?.errors ?? []).map((error) => error.message).join('; ')}</span>
        </div>
      ))}
    </div>
  )
}
