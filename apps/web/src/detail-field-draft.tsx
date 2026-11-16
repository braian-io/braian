import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'

export type DetailFieldDraftController = {
  commit: () => boolean
  discard: () => void
}

export type DetailFieldDraftHandle = {
  /** Commit every pending field draft. False when any field is invalid. */
  flush: () => boolean
  /** Drop local drafts without staging (e.g. Escape / Discard). */
  discard: () => void
}

const DetailFieldDraftRegister = createContext<((controller: DetailFieldDraftController) => () => void) | null>(null)

export const DetailFieldDraftHost = forwardRef<DetailFieldDraftHandle, { children: ReactNode }>(function DetailFieldDraftHost(
  { children },
  ref,
) {
  const controllers = useRef(new Set<DetailFieldDraftController>())
  const register = useCallback((controller: DetailFieldDraftController) => {
    controllers.current.add(controller)
    return () => {
      controllers.current.delete(controller)
    }
  }, [])
  const flush = useCallback(() => {
    let ok = true
    for (const controller of controllers.current) {
      if (!controller.commit()) ok = false
    }
    return ok
  }, [])
  const discardAll = useCallback(() => {
    for (const controller of controllers.current) controller.discard()
  }, [])
  useImperativeHandle(ref, () => ({ flush, discard: discardAll }), [flush, discardAll])
  return <DetailFieldDraftRegister.Provider value={register}>{children}</DetailFieldDraftRegister.Provider>
})

export function useDetailFieldDraft(controller: DetailFieldDraftController) {
  const register = useContext(DetailFieldDraftRegister)
  const controllerRef = useRef(controller)
  controllerRef.current = controller
  useEffect(() => {
    if (!register) return
    const wrapped: DetailFieldDraftController = {
      commit: () => controllerRef.current.commit(),
      discard: () => controllerRef.current.discard(),
    }
    return register(wrapped)
  }, [register])
}