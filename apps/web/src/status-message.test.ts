import { describe, expect, it, vi } from 'vitest'
import { isConnected, shortError, statusMessage, type StatusInput, type StatusUpdateNotice } from './status-message'

const text = { reconnecting: 'Offline / reconnecting…', saving: 'Saving…', saveFailed: 'Save failed', locked: 'Locked' }
const reload = vi.fn()
const update: StatusUpdateNotice = {
  text: 'A new version is available',
  action: { label: 'Reload', onClick: reload },
}
const normal: StatusInput = {
  saving: false,
  online: true,
  live: 'open',
  saveError: null,
  locked: false,
  update: null,
}

describe('statusMessage', () => {
  it('is empty when saved and connected', () => {
    expect(statusMessage(normal, text)).toBeNull()
    expect(statusMessage({ ...normal, live: 'message' }, text)).toBeNull()
    expect(statusMessage({ ...normal, live: 'connecting' }, text)).toBeNull()
  })

  it('shows offline when the browser or the stream is down', () => {
    expect(statusMessage({ ...normal, online: false }, text)?.kind).toBe('offline')
    expect(statusMessage({ ...normal, live: 'reconnecting' }, text)?.text).toBe('Offline / reconnecting…')
    expect(statusMessage({ ...normal, live: 'closed' }, text)?.kind).toBe('offline')
  })

  it('ranks offline over save error over locked over saving over update', () => {
    const all: StatusInput = {
      saving: true,
      online: false,
      live: 'reconnecting',
      saveError: 'boom',
      locked: true,
      update,
    }
    expect(statusMessage(all, text)?.kind).toBe('offline')
    expect(statusMessage({ ...all, online: true, live: 'open' }, text)?.kind).toBe('error')
    expect(statusMessage({ ...all, online: true, live: 'open', saveError: null }, text)?.kind).toBe('locked')
    expect(
      statusMessage({ ...all, online: true, live: 'open', saveError: null, locked: false }, text)?.kind,
    ).toBe('saving')
    expect(
      statusMessage(
        { ...all, online: true, live: 'open', saveError: null, locked: false, saving: false },
        text,
      )?.kind,
    ).toBe('update')
  })

  it('offline with update still shows offline', () => {
    const message = statusMessage({ ...normal, online: false, update }, text)
    expect(message?.kind).toBe('offline')
    expect(message?.action).toBeUndefined()
  })

  it('shows update again after offline clears', () => {
    expect(statusMessage({ ...normal, online: false, update }, text)?.kind).toBe('offline')
    const again = statusMessage({ ...normal, update }, text)
    expect(again?.kind).toBe('update')
    expect(again?.text).toBe('A new version is available')
    expect(again?.action?.label).toBe('Reload')
  })

  it('error with update still shows error', () => {
    const message = statusMessage({ ...normal, saveError: 'nope', update }, text)
    expect(message?.kind).toBe('error')
    expect(message?.action).toBeUndefined()
  })

  it('locked with update still shows locked', () => {
    const message = statusMessage({ ...normal, locked: true, update }, text)
    expect(message?.kind).toBe('locked')
    expect(message?.action).toBeUndefined()
  })

  it('shortens a save error and keeps the full text as the title', () => {
    const long = 'x'.repeat(200)
    const message = statusMessage({ ...normal, saveError: long }, text)
    expect(message?.text.length).toBeLessThan(80)
    expect(message?.title).toBe(long)
    expect(shortError('a\n  b')).toBe('a b')
  })

  it('treats a missing network as disconnected', () => {
    expect(isConnected(true, 'open')).toBe(true)
    expect(isConnected(false, 'open')).toBe(false)
  })
})
