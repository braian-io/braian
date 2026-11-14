import type { Json } from './api'
import { reportWriteError } from './write-error'

export type TablePrefsView = {
  id: string
  type: string
  title: string
  pane?: string
  position?: number
  state: Json
}

export type TablePrefsTable = {
  sort: string
  groupBy: string
  sizes: Record<string, number>
}

export type TablePrefsSnapshot = {
  view: TablePrefsView
  workspaceId: string
  table: TablePrefsTable
}

export type TablePrefsBody = {
  id: string
  workspace_id: string
  type: string
  title: string
  pane: string
  position: number
  state: Json
}

export type TablePrefsPost = (body: TablePrefsBody, signal: AbortSignal) => Promise<unknown>

export type TablePrefsSaverOptions = {
  delayMs?: number
  onError?: (reason: unknown) => void
}

export function tablePrefsBody(snapshot: TablePrefsSnapshot): TablePrefsBody {
  const { view, workspaceId, table } = snapshot
  return {
    id: view.id,
    workspace_id: workspaceId,
    type: view.type,
    title: view.title,
    pane: view.pane ?? 'center',
    position: view.position ?? 0,
    state: {
      ...view.state,
      table: {
        // Never persist the live free-text search. Writing an empty filter also
        // clears a query already saved on a shared view (row 242).
        filter: '',
        sort: table.sort,
        groupBy: table.groupBy,
        sizes: table.sizes,
      },
    },
  }
}

export function createTablePrefsSaver(post: TablePrefsPost, options: TablePrefsSaverOptions = {}) {
  const delayMs = options.delayMs ?? 400
  const onError = options.onError ?? reportWriteError
  let source: (() => TablePrefsSnapshot) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null

  const clearTimer = () => {
    if (timer == null) return
    clearTimeout(timer)
    timer = null
  }

  const send = () => {
    if (!source) return
    clearTimer()
    const body = tablePrefsBody(source())
    const fingerprint = JSON.stringify(body.state)
    controller?.abort()
    const active = new AbortController()
    controller = active
    void post(body, active.signal)
      .then(() => {
        if (active.signal.aborted) return
        if (controller === active) controller = null
        const current = source?.()
        if (!current) return
        if (JSON.stringify(tablePrefsBody(current).state) !== fingerprint) send()
      })
      .catch((reason: unknown) => {
        if (active.signal.aborted) return
        if (controller === active) controller = null
        onError(reason)
      })
  }

  const schedule = (getSnapshot: () => TablePrefsSnapshot) => {
    source = getSnapshot
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      send()
    }, delayMs)
  }

  const cancel = () => {
    clearTimer()
    controller?.abort()
    controller = null
  }

  const flush = () => {
    clearTimer()
    send()
  }

  return { schedule, cancel, flush }
}
