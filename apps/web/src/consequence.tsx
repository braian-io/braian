import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api, failureLines, type Json } from './api'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { suggestionLines } from './field-diff'
import { FieldDiff } from './field-diff-view'
import { copy } from './i18n'
import { formatCount } from './format'
import { describeModelSteps } from './model-step-text'
import { affectedLabel, typeNames } from './type-labels'
import { onProposal } from './proposal-bus'
import { inCatalog } from './catalog-scope'
import { isRollbackProposal, restoreAcceptConflictMessage } from './restore-proposal'
import { StateNote } from './states'

type HostSession = {
  setProposalId: (value: string | null) => void
  push: (line: string) => void
}

/** Types whose Allowed trees list still contains a structure this proposal deletes. */
export function typesLosingAllowedTree(defs: Json | undefined, steps: Json[]): string[] {
  const tokens = steps
    .filter((step) => step.op === 'delete_structure')
    .map((step) => String(step.structure ?? ''))
    .filter(Boolean)
  if (tokens.length === 0) return []
  const structures = (defs?.structures as Json[] | undefined) ?? []
  const wanted = new Set(tokens)
  for (const token of tokens) {
    const structure = structures.find(
      (row) => String(row.id ?? '') === token || String(row.key ?? '') === token,
    )
    if (!structure) continue
    wanted.add(String(structure.id ?? ''))
    wanted.add(String(structure.key ?? ''))
  }
  const names = typeNames(defs)
    .filter((type) => type.structures?.some((token) => wanted.has(token)))
    .map((type) => type.singular)
    .filter(Boolean)
  return [...new Set(names)]
}

function loadingTitle(operation: string | undefined): string {
  switch (operation) {
    case 'model.delete_structure':
      return copy.deleteStructureTitle
    case 'model.delete_group':
      return copy.deleteGroupTitle
    case 'model.delete_type':
      return copy.deleteType
    case 'model.delete_attribute':
      return copy.deleteAttribute
    case 'model.delete_unit_family':
      return copy.deleteUnitFamily
    case 'model.delete_unit':
      return copy.deleteUnit
    default:
      return copy.reviewChangeTitle
  }
}

export function ConsequenceHost({ session }: { session: HostSession }) {
  const queryClient = useQueryClient()
  const [id, setId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<string | undefined>()
  const [operation, setOperation] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const discardPending = useRef(false)
  /** After a failed discard, dismiss without another POST so the draft stays on the server. */
  const dismissWithoutDiscard = useRef(false)
  const dismiss = () => {
    const target = opener.current
    opener.current = null
    setCatalog(undefined)
    setId(null)
    if (target?.isConnected) queueMicrotask(() => target.focus())
  }
  useEffect(() => onProposal((proposal) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setError('')
    dismissWithoutDiscard.current = false
    setOperation(proposal.operation)
    setCatalog(proposal.catalog)
    setId(proposal.id)
  }), [])
  const scope = <T,>(fn: () => Promise<T>) => (catalog ? inCatalog(catalog, fn) : fn())
  const defs = useQuery({
    queryKey: catalog ? ['definitions', catalog] : ['definitions'],
    queryFn: () => scope(() => api.get('/v1/definitions')),
    staleTime: 60_000,
  })
  const proposal = useQuery({
    queryKey: ['proposal', id, catalog ?? ''],
    queryFn: () => scope(() => api.get('/v1/proposals/{id}', { params: { path: { id: id ?? '' } } })),
    enabled: Boolean(id),
  })
  const body = proposal.data
  const rows = (body?.rows as Json[] | undefined) ?? []
  const objectRow = rows.find((row) => row.object_id)
  const isRollback = isRollbackProposal(body?.source) || operation === 'rollback'
  const consequence = (body?.consequence as Json | undefined) ?? {}
  const modelSteps = rows
    .filter((row) => String(row.type_key ?? '') === 'model' && row.patch && typeof row.patch === 'object')
    .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
    .map((row) => row.patch as Json)
  const stepTexts = describeModelSteps(modelSteps, defs.data)
  const lines = stepTexts.length > 0
    ? stepTexts.map((step) => step.sentence)
    : ((consequence.lines as string[] | undefined) ?? [])
  const loadedTitle = stepTexts.length === 1
    ? stepTexts[0]?.sentence ?? String(body?.title ?? copy.dataModel)
    : stepTexts.length > 1
      ? copy.reviewChangeTitle
      : String(body?.title ?? copy.dataModel)
  const restoreDiff = isRollback && objectRow
    ? suggestionLines(objectRow.base_values as Json | undefined, objectRow.patch, defs.data)
    : []
  const restoreEmpty = isRollback && !proposal.isPending && !proposal.isError && restoreDiff.length === 0
  const title = proposal.isPending
    ? (operation === 'rollback' ? copy.rollback : loadingTitle(operation))
  : isRollback
    ? String(body?.title ?? copy.rollback)
    : loadedTitle
  const showDiff = stepTexts.length !== 1 && lines.length > 0
  const warnings = (consequence.warnings as string[] | undefined) ?? []
  const samples = (consequence.samples as Json[] | undefined) ?? []
  const jobs = (consequence.jobs as Json[] | undefined) ?? []
  const errors = (consequence.definition_errors as string[] | undefined) ?? []
  const destructive = consequence.destructive === true
  const destructiveIntent = destructive || (proposal.isPending && String(operation ?? '').includes('delete'))
  const detail = (consequence.detail as string[] | undefined) ?? []
  const sentence = String(consequence.sentence ?? '')
  const count = (key: string) => {
    const value = consequence[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }
  const values = count('values')
  const objects = count('objects')
  const links = count('links')
  const selections = count('selections')
  const noImpact = values === 0 && objects === 0 && (links ?? 0) === 0 && (selections ?? 0) === 0
  const deleteLines = noImpact ? [copy.noValuesDeleted] : detail
  const unlinkedTypes = typesLosingAllowedTree(defs.data, modelSteps)
  const affected = typeof consequence.affected_objects === 'number' && Number.isFinite(consequence.affected_objects)
    ? consequence.affected_objects
    : 0
  const sampleNames = samples
    .map((item) => String(item.key ?? item.id ?? ''))
    .filter(Boolean)
  const showImpact = !isRollback && !proposal.isPending
    && (affected > 0 || sampleNames.length > 0 || jobs.length > 0)
  const showSourceChip = Boolean(body?.source)
    && String(body?.source) !== 'user'
    && !isRollback
  const confirmLabel = isRollback ? copy.rollback : destructiveIntent ? copy.delete : copy.save
  const confirmTestId = destructiveIntent ? 'confirm-delete' : 'confirm-model'
  if (!id) return null
  const close = dismiss
  const requestClose = () => {
    if (busy) return
    if (dismissWithoutDiscard.current) close()
    else close()
  }
  const cancel = () => {
    if (busy) return
    if (dismissWithoutDiscard.current) {
      close()
      return
    }
    discard()
  }
  const discard = () => {
    if (!id || discardPending.current || busy) return
    discardPending.current = true
    setBusy(true)
    void scope(() => api.post('/v1/proposals/{id}/discard', { params: { path: { id: id } } }))
      .then(() => {
        session.push(copy.cancel)
        void queryClient.invalidateQueries({ queryKey: ['proposals'] })
        close()
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 404) {
          void queryClient.invalidateQueries({ queryKey: ['proposals'] })
          close()
          return
        }
        dismissWithoutDiscard.current = true
        setError(reason instanceof Error ? reason.message : copy.validation)
      })
      .finally(() => {
        setBusy(false)
        discardPending.current = false
      })
  }
  const confirm = () => {
    setBusy(true)
    void scope(() => api.post('/v1/proposals/{id}/accept', { params: { path: { id: id } }, body: {} }))
      .then((result) => {
        const failed = failureLines(result)
        if (failed.length > 0) {
          setError(String(failed[0]?.detail ?? copy.validation))
          return
        }
        session.setProposalId(id)
        if (!destructiveIntent) session.push(copy.saved)
        void queryClient.invalidateQueries({ queryKey: ['definitions'] })
        if (operation === 'model.delete_type') {
          void queryClient.invalidateQueries({ queryKey: ['workspaces'] })
        }
        void queryClient.invalidateQueries({ queryKey: ['proposals'] })
        void queryClient.invalidateQueries({ queryKey: ['proposal', id] })
        void queryClient.invalidateQueries({ queryKey: ['objects'] })
        void queryClient.invalidateQueries({ queryKey: ['object'] })
        void queryClient.invalidateQueries({ queryKey: ['path-values'] })
        void queryClient.invalidateQueries({ queryKey: ['history'] })
        close()
      })
      .catch((reason: unknown) => {
        const conflict = restoreAcceptConflictMessage(reason)
        if (conflict) {
          dismissWithoutDiscard.current = true
          setError(conflict)
          return
        }
        setError(reason instanceof Error ? reason.message : copy.validation)
      })
      .finally(() => setBusy(false))
  }
  return (
    <Dialog open onOpenChange={(next) => {
      if (!next) requestClose()
    }}>
      <DialogContent
        className="consequence"
        data-testid="consequence"
        onEscapeKeyDown={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="toolbar consequence-title">
          <DialogTitle asChild><strong>{title}</strong></DialogTitle>
        </div>
        {showSourceChip ? (
          <p>
            <span className="chip" data-testid="proposal-source">{String(body?.source)}</span>
          </p>
        ) : null}
        <DialogDescription asChild><p className="hint">{copy.reviewChange}</p></DialogDescription>
        {proposal.isPending ? <StateNote tone="loading" title={copy.loadingModel} /> : null}
        {proposal.isError ? <StateNote tone="error" title={copy.errorModel} /> : null}
        {isRollback && !proposal.isPending && restoreDiff.length > 0 ? (
          <FieldDiff lines={restoreDiff} />
        ) : null}
        {restoreEmpty ? (
          <p className="hint" data-testid="restore-no-changes">{copy.restoreAlreadyMatches}</p>
        ) : null}
        {!isRollback && !proposal.isPending && showDiff ? (
          <>
            <p className="hint">{copy.modelDiff}</p>
            <ul className="proposal-tree" data-testid="model-diff">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
        {!proposal.isPending ? warnings.map((warning) => (
          <p key={warning} className="error" role="status" data-testid="key-warning">{warning}</p>
        )) : null}
        {!proposal.isPending && destructive ? (
          <div data-testid="delete-counts">
            {deleteLines.length > 0
              ? deleteLines.map((line) => <p key={line}>{line}</p>)
              : sentence ? <p>{sentence}</p> : null}
          </div>
        ) : null}
        {!proposal.isPending && unlinkedTypes.length > 0 ? (
          <p data-testid="allowed-trees-unlink">
            {copy.allowedTreesLinkRemoved.replace('{types}', unlinkedTypes.join(', '))}
          </p>
        ) : null}
        {showImpact ? (
          <div data-testid="impact-result">
            {affected > 0 ? (
              <p>
                {affectedLabel(rows.map((row) => String(row.type_key ?? '')), typeNames(defs.data))}: {formatCount(affected)}
              </p>
            ) : null}
            {sampleNames.length > 0 ? (
              <p>
                {copy.samples}: {sampleNames.join(', ')}
              </p>
            ) : null}
            {jobs.map((job) => (
              <p key={String(job.key)}>
                {String(job.title)} · {((job.reads_fields as string[]) ?? []).join(', ')}
              </p>
            ))}
          </div>
        ) : null}
        {!proposal.isPending ? errors.map((item) => (
          <p key={item} className="error">{item}</p>
        )) : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="toolbar">
          <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>{copy.cancel}</Button>
          <Button
            type="button"
            variant={destructiveIntent ? 'danger' : 'primary'}
            data-testid={confirmTestId}
            onClick={confirm}
            disabled={busy || proposal.isPending || proposal.isError || errors.length > 0 || restoreEmpty}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}