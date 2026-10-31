import { describe, expect, it, vi } from 'vitest'
import { copy } from './i18n'
import { statusMessage, type StatusUpdateNotice } from './status-message'

/** Pure mapping StatusBar uses when useNewVersionAvailable().available is true. */
function updateNoticeFromCopy(reload: () => void): StatusUpdateNotice {
  return {
    text: copy.newVersionAvailable,
    action: { label: copy.reloadPage, onClick: reload },
  }
}

describe('status bar ↔ new version coupling', () => {
  it('maps a detected deploy to the update notice with Reload', () => {
    const reload = vi.fn()
    const notice = updateNoticeFromCopy(reload)
    const message = statusMessage(
      {
        saving: false,
        online: true,
        live: 'open',
        saveError: null,
        locked: false,
        update: notice,
      },
      {
        reconnecting: copy.reconnecting,
        saving: copy.saving,
        saveFailed: copy.saveFailed,
        locked: copy.locked,
      },
    )
    expect(message?.kind).toBe('update')
    expect(message?.text).toBe('A new version is available')
    expect(message?.action?.label).toBe('Reload')
    message?.action?.onClick()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('stays empty when no newer deploy is advertised', () => {
    const message = statusMessage(
      {
        saving: false,
        online: true,
        live: 'open',
        saveError: null,
        locked: false,
        update: null,
      },
      {
        reconnecting: copy.reconnecting,
        saving: copy.saving,
        saveFailed: copy.saveFailed,
        locked: copy.locked,
      },
    )
    expect(message).toBeNull()
  })
})
