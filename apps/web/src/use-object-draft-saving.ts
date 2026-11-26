import { useSyncExternalStore } from 'react'
import { objectDraftSaving, subscribeObjectDraftSaving } from './object-draft-save'

export function useObjectDraftSaving(): boolean {
  return useSyncExternalStore(subscribeObjectDraftSaving, objectDraftSaving, objectDraftSaving)
}
