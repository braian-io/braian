import { useEffect, useState } from 'react'
import { modelTableDraftDirty, subscribeModelTableDraft } from './model-table-draft'

export function ModelTableBeforeUnload() {
  const [dirty, setDirty] = useState(modelTableDraftDirty())

  useEffect(() => subscribeModelTableDraft(() => {
    setDirty(modelTableDraftDirty())
  }), [])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  return null
}