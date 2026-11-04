import { useEffect, useState } from 'react'
import { ApiError, api, jsonRecord } from './api'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { readConfigDocuments } from './config-drop'

type PlanAction = 'create' | 'update' | 'rename' | 'delete'
type PlanKind = 'language' | 'attribute' | 'type' | 'structure' | 'group' | 'class' | 'value_list' | 'unit_family' | 'catalog' | 'merge_profile' | 'ownership'
type PlanAffected = {
  objects?: number
  values?: number
  links?: number
  selections?: number
}
type PlanStep = {
  action: PlanAction
  kind: PlanKind
  key: string
  renamedFrom?: string | null
  fields?: string[]
  destructive?: boolean
  blocked?: boolean
  affected?: PlanAffected
}
type Plan = { steps?: PlanStep[] }

const KIND_ORDER: PlanKind[] = [
  'language',
  'attribute',
  'type',
  'structure',
  'group',
  'class',
  'value_list',
  'unit_family',
  'catalog',
  'merge_profile',
  'ownership',
]

const GROUPS: Array<{ id: string; label: string }> = [
  { id: 'model', label: 'Model' },
  { id: 'value_list', label: 'Value lists' },
  { id: 'unit_family', label: 'Unit families' },
  { id: 'catalog', label: 'Catalogs' },
  { id: 'merge_profile', label: 'Merge profiles' },
  { id: 'ownership', label: 'Ownership' },
]

const ACTION_LABELS: Record<PlanAction, string> = {
  create: 'Create',
  update: 'Update',
  rename: 'Rename',
  delete: 'Delete',
}

function groupOf(kind: PlanKind) {
  if (kind === 'value_list' || kind === 'unit_family') return kind
  if (kind === 'catalog' || kind === 'merge_profile' || kind === 'ownership') return kind
  return 'model'
}

function count(value: number | undefined, singular: string, plural: string) {
  const number = Number(value ?? 0)
  if (number === 0) return undefined
  return `${number} ${number === 1 ? singular : plural}`
}

function affectedText(affected: PlanAffected | undefined): string {
  return [
    count(affected?.objects, 'object', 'objects'),
    count(affected?.values, 'value', 'values'),
    count(affected?.links, 'link', 'links'),
    count(affected?.selections, 'selection', 'selections'),
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ')
}

function stepsOf(value: unknown): PlanStep[] {
  const steps = jsonRecord(value)?.steps
  return Array.isArray(steps) ? (steps as PlanStep[]) : []
}

function ordered(steps: PlanStep[], group: string): PlanStep[] {
  return steps
    .filter((step) => groupOf(step.kind) === group)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
}

export function ConfigApplyDialog({
  open,
  files,
  onClose,
  onOpenInReview,
}: {
  open: boolean
  files: File[]
  onClose: () => void
  onOpenInReview: (proposalId: string) => void
}) {
  const [documents, setDocuments] = useState<unknown[]>([])
  const [steps, setSteps] = useState<PlanStep[]>([])
  const [planning, setPlanning] = useState(true)
  const [allowDestructive, setAllowDestructive] = useState(false)
  const [proposalId, setProposalId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setPlanning(true)
      return
    }
    let cancelled = false
    setDocuments([])
    setSteps([])
    setPlanning(true)
    setAllowDestructive(false)
    setProposalId('')
    setBusy(false)
    setError('')
    void (async () => {
      try {
        const next = await readConfigDocuments(files)
        const plan = await api.post('/v1/config/plan', { body: next })
        if (cancelled) return
        setDocuments(next)
        setSteps(stepsOf(plan))
      } catch (reason: unknown) {
        if (!cancelled) {
          setError(reason instanceof ApiError ? reason.message : 'Could not plan the configuration')
        }
      } finally {
        if (!cancelled) setPlanning(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, files])

  const blocked = steps.filter((step) => step.blocked)
  const noChanges = !planning && !error && steps.length === 0
  const canCreate = !busy && !planning && !error && steps.length > 0 && (blocked.length === 0 || allowDestructive)

  const createProposal = () => {
    if (!canCreate || noChanges) return
    setBusy(true)
    setError('')
    void (async () => {
      try {
        const body = allowDestructive ? { documents, allowDestructive: true } : documents
        const result = await api.post('/v1/config/apply', { body })
        const id = String(jsonRecord(result)?.proposal_id ?? '')
        if (!id) throw new Error('The server did not return a proposal')
        setProposalId(id)
      } catch (reason: unknown) {
        setError(reason instanceof ApiError ? reason.message : 'Could not create the proposal')
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent data-testid="config-apply-dialog">
        <DialogTitle>Apply configuration</DialogTitle>
        <DialogDescription>
          Review how the dropped documents change the model before they become one proposal.
        </DialogDescription>
        <div>
          <span className="muted">Files</span>
          <ul className="proposal-tree" data-testid="config-apply-files">
            {files.map((file) => (
              <li key={`${file.name}:${file.size}`}>{file.name}</li>
            ))}
          </ul>
        </div>
        {planning ? <p className="hint" data-testid="config-apply-planning">Planning…</p> : null}
        {error ? <p className="error" role="alert" data-testid="config-apply-error">{error}</p> : null}
        {noChanges ? <p data-testid="config-apply-no-changes">No changes</p> : null}
        {!planning && !error && !noChanges
          ? GROUPS.map((group) => {
              const groupSteps = ordered(steps, group.id)
              if (groupSteps.length === 0) return null
              return (
                <section key={group.id} data-testid={`config-plan-${group.id}`}>
                  <h3>{group.label}</h3>
                  <ul className="proposal-tree">
                    {groupSteps.map((step) => {
                      const counts = affectedText(step.affected)
                      return (
                        <li
                          key={`${step.kind}:${step.action}:${step.key}`}
                          className="model-row"
                          data-testid="config-plan-step"
                          data-action={step.action}
                          data-kind={step.kind}
                        >
                          <Badge>{ACTION_LABELS[step.action] ?? step.action}</Badge>
                          <span>
                            {step.action === 'rename' && step.renamedFrom
                              ? `${step.renamedFrom} -> ${step.key}`
                              : step.key}
                          </span>
                          {step.fields && step.fields.length > 0 ? (
                            <span className="muted">({step.fields.join(', ')})</span>
                          ) : null}
                          {step.blocked ? (
                            <>
                              <Badge data-testid="config-step-blocked">Blocked</Badge>
                              <span className="muted">{counts ? `Deletes ${counts}` : 'Deletes data'}</span>
                            </>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })
          : null}
        {!proposalId && blocked.length > 0 ? (
          <label className="check-row">
            <Checkbox
              data-testid="config-apply-allow"
              checked={allowDestructive}
              onCheckedChange={(value) => setAllowDestructive(value === true)}
              aria-label="Allow destructive changes"
            />
            <span>Allow destructive changes</span>
          </label>
        ) : null}
        {proposalId ? (
          <div className="dialog-actions" data-testid="config-apply-created">
            <p>Proposal created</p>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" data-testid="config-apply-open-review" onClick={() => onOpenInReview(proposalId)}>
              Open in Review
            </Button>
          </div>
        ) : (
          <div className="dialog-actions">
            {noChanges ? (
              <Button variant="ghost" onClick={onClose}>Close</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button
                  variant="primary"
                  data-testid="config-apply-create"
                  disabled={!canCreate || planning}
                  onClick={createProposal}
                >
                  Create proposal
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
