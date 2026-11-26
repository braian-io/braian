import { useCallback, useEffect, useRef, useState } from 'react'
import { OBJECT_NAV_DEBOUNCE_MS } from './object-list-preview'
import { OBJECT_LAND_IMMEDIATE, objectNavReplaceId } from './object-nav-signal'

/** Debounce readable object tokens written to the URL during table arrow bursts only. */
export function useUrlObjectMirror(hookObject: string | null): string | null {
  const [mirrored, setMirrored] = useState(hookObject)
  const latest = useRef(hookObject)
  latest.current = hookObject
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setMirrored(latest.current)
  }, [])

  useEffect(() => {
    const onHistory = () => flush()
    window.addEventListener('popstate', onHistory)
    return () => window.removeEventListener('popstate', onHistory)
  }, [flush])

  useEffect(() => {
    const onLand = () => flush()
    window.addEventListener(OBJECT_LAND_IMMEDIATE, onLand)
    return () => window.removeEventListener(OBJECT_LAND_IMMEDIATE, onLand)
  }, [flush])

  useEffect(() => {
    if (hookObject === mirrored) return
    if (!hookObject) {
      flush()
      return
    }
    // Clicks, Back/Forward, and renames mirror immediately; only arrow bursts wait.
    if (!objectNavReplaceId()) {
      flush()
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, OBJECT_NAV_DEBOUNCE_MS)
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [hookObject, mirrored, flush])

  return mirrored
}