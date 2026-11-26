import { api, jsonRecord, type Json } from './api'
import type { QueryClient } from '@tanstack/react-query'
import { beginOwnModelSave, endOwnModelSave, modelRevisionFromDefinitions } from './model-revision-watch'

export type ModelStep = { op: string } & Record<string, unknown>

type CommitBody = {
  steps?: ModelStep[]
  operation?: string
  args?: Json
  confirm_name?: string
}

let queue: Promise<void> = Promise.resolve()

/**
 * Apply model steps as one revision. Uses the revision this client last loaded,
 * and refuses when the server has moved. Does not stage the person's draft, so
 * the review dialog stays closed. Own-save bookkeeping keeps the reload banner
 * from treating this write as someone else's.
 */
export function commitModelChange(queryClient: QueryClient, body: CommitBody): Promise<void> {
  const run = queue.then(() => commitNow(queryClient, body))
  queue = run.then(() => undefined, () => undefined)
  return run
}

export function commitModelOperation(queryClient: QueryClient, operation: string, args: Json = {}): Promise<void> {
  return commitModelChange(queryClient, { operation, args })
}

export function commitModelSteps(queryClient: QueryClient, steps: ModelStep[]): Promise<void> {
  return commitModelChange(queryClient, { steps })
}

async function commitNow(queryClient: QueryClient, body: CommitBody): Promise<void> {
  let defs = queryClient.getQueryData<Json>(['definitions'])
  if (!defs) defs = (await api.get('/v1/definitions')) as Json
  const base = modelRevisionFromDefinitions(defs) ?? 0
  beginOwnModelSave()
  let ended = false
  const finish = (revision: number | undefined) => {
    if (ended) return
    ended = true
    endOwnModelSave(revision)
  }
  try {
    const saved = await api.post('/v1/model/commit', {
      body: {
        base_revision: base,
        ...(body.steps ? { steps: body.steps } : {}),
        ...(body.operation ? { operation: body.operation } : {}),
        ...(body.args ? { args: body.args } : {}),
        ...(body.confirm_name ? { confirm_name: body.confirm_name } : {}),
      },
    })
    const record = jsonRecord(saved)
    const revision = typeof record?.model_revision === 'number' ? record.model_revision : undefined
    finish(revision)
    if (revision !== undefined) {
      queryClient.setQueryData<Json>(['definitions'], (current) => (
        current ? { ...current, model_revision: revision } : current
      ))
    }
    await queryClient.refetchQueries({ queryKey: ['definitions'] })
    void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
    void queryClient.invalidateQueries({ queryKey: ['attribute-definitions'] })
    void queryClient.invalidateQueries({ queryKey: ['catalogs'] })
  } catch (error) {
    finish(undefined)
    throw error
  }
}

/** Drop a saved overlay once it still matches the row we wrote. */
export function dropSavedDraftRow<T>(current: Record<string, T>, id: string, written: T): Record<string, T> {
  const saved = current[id]
  if (!saved || JSON.stringify(saved) !== JSON.stringify(written)) return current
  if (!(id in current)) return current
  const next = { ...current }
  delete next[id]
  return next
}
