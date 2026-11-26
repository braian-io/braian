import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type Json } from './api'
import { Button } from './components/ui/button'
import { copy } from './i18n'
import {
  isModelLiveEvent,
  modelRevisionFromDefinitions,
  shouldShowModelReloadBanner,
  syncAcknowledgedRevision,
} from './model-revision-watch'

const MODEL_LIVE_EVENT = 'braian-model-live'
const MODEL_RELOADED_EVENT = 'braian-model-definitions-reloaded'
const POLL_MS = 20_000

export function emitModelLiveEvent(raw: string) {
  if (!isModelLiveEvent(raw)) return
  window.dispatchEvent(new CustomEvent(MODEL_LIVE_EVENT, { detail: { raw } }))
}

async function fetchLatestModelRevision(): Promise<number | undefined> {
  const body = (await api.get('/v1/definitions')) as Json
  return modelRevisionFromDefinitions(body)
}

export async function reloadCommittedModelDefinitions(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.fetchQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  await queryClient.fetchQuery({ queryKey: ['model-draft'], queryFn: () => api.get('/v1/model/draft') })
  window.dispatchEvent(new Event(MODEL_RELOADED_EVENT))
}

export function ModelRevisionReloadBanner({ enabled, loadedRevision }: { enabled: boolean; loadedRevision: number | undefined }) {
  const queryClient = useQueryClient()
  const [visible, setVisible] = useState(false)
  const checking = useRef(false)
  const loadedRef = useRef(loadedRevision)
  loadedRef.current = loadedRevision

  const checkServerRevision = useCallback(async () => {
    if (!enabled || checking.current) return
    checking.current = true
    try {
      const serverRevision = await fetchLatestModelRevision()
      if (shouldShowModelReloadBanner(loadedRef.current, serverRevision)) {
        setVisible(true)
      } else {
        syncAcknowledgedRevision(serverRevision)
        if (serverRevision !== undefined && loadedRef.current !== undefined && serverRevision <= loadedRef.current) {
          setVisible(false)
        }
      }
    } finally {
      checking.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setVisible(false)
      return
    }
    syncAcknowledgedRevision(loadedRevision)
    if (loadedRevision !== undefined) setVisible(false)
  }, [enabled, loadedRevision])

  useEffect(() => {
    if (!enabled) return
    const onLive = () => { void checkServerRevision() }
    window.addEventListener(MODEL_LIVE_EVENT, onLive)
    const timer = window.setInterval(() => { void checkServerRevision() }, POLL_MS)
    return () => {
      window.removeEventListener(MODEL_LIVE_EVENT, onLive)
      window.clearInterval(timer)
    }
  }, [enabled, checkServerRevision])

  const dismiss = () => setVisible(false)

  const reload = () => {
    void reloadCommittedModelDefinitions(queryClient).then(() => {
      const next = modelRevisionFromDefinitions(queryClient.getQueryData<Json>(['definitions']))
      syncAcknowledgedRevision(next)
      setVisible(false)
    })
  }

  if (!enabled || !visible) return null

  return (
    <div className="draft-bar model-reload-bar" data-testid="model-reload-banner" role="status">
      <span>{copy.modelChangedReload}</span>
      <Button type="button" variant="primary" data-testid="model-reload-button" onClick={reload}>
        {copy.reloadPage}
      </Button>
      <Button type="button" variant="default" data-testid="model-reload-dismiss" onClick={dismiss}>
        {copy.dismiss}
      </Button>
    </div>
  )
}

export { MODEL_RELOADED_EVENT }