import { useCallback, useEffect, useRef, useState } from 'react'
import { OBJECT_NAV_DEBOUNCE_MS } from './object-list-preview'
import { OBJECT_LAND_IMMEDIATE } from './object-nav-signal'

/** Debounce full object fetches so fast table arrows only load the landed row. */
export function useObjectLand(objectId: string | null) {
  const [landedId, setLandedId] = useState(objectId)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncTo = useCallback((id: string | null) => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setLandedId(id)
  }, [])

  useEffect(() => {
    const onImmediate = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id ?? null
      // React may not have applied setObjectId yet; the signal names the row to fetch.
      if (id) syncTo(id)
    }
    window.addEventListener(OBJECT_LAND_IMMEDIATE, onImmediate)
    return () => window.removeEventListener(OBJECT_LAND_IMMEDIATE, onImmediate)
  }, [syncTo])

  useEffect(() => {
    if (objectId === landedId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      setLandedId(objectId)
    }, OBJECT_NAV_DEBOUNCE_MS)
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [objectId, landedId])

  const settled = !objectId || objectId === landedId
  return { landedId, settled }
}