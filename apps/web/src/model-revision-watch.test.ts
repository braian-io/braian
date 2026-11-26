import { describe, expect, it, beforeEach } from 'vitest'
import {
  beginOwnModelSave,
  endOwnModelSave,
  isModelLiveEvent,
  modelRevisionFromDefinitions,
  resetOwnModelSaveState,
  shouldShowModelReloadBanner,
  syncAcknowledgedRevision,
} from './model-revision-watch'

describe('model revision watch', () => {
  beforeEach(() => {
    resetOwnModelSaveState()
  })

  it('reads model_revision from definitions', () => {
    expect(modelRevisionFromDefinitions({ model_revision: 4 })).toBe(4)
    expect(modelRevisionFromDefinitions({})).toBeUndefined()
  })

  it('detects model events on the live stream', () => {
    expect(isModelLiveEvent('{"op":"model","seq":9}')).toBe(true)
    expect(isModelLiveEvent('{"op":"update","object_id":"x"}')).toBe(false)
  })

  it('shows the banner when the server revision moves ahead', () => {
    expect(shouldShowModelReloadBanner(3, 4)).toBe(true)
    expect(shouldShowModelReloadBanner(4, 4)).toBe(false)
    expect(shouldShowModelReloadBanner(5, 4)).toBe(false)
  })

  it('suppresses the banner for the session that saved', () => {
    beginOwnModelSave()
    expect(shouldShowModelReloadBanner(3, 4)).toBe(false)
    endOwnModelSave(4)
    expect(shouldShowModelReloadBanner(3, 4)).toBe(false)
    expect(shouldShowModelReloadBanner(3, 5)).toBe(true)
  })

  it('syncs acknowledged revision after local definitions refresh', () => {
    beginOwnModelSave()
    endOwnModelSave(7)
    syncAcknowledgedRevision(7)
    expect(shouldShowModelReloadBanner(7, 7)).toBe(false)
  })
})