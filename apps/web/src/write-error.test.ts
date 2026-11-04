import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from './api'
import { messageFromErrorBody, reportWriteError, writeErrorMessage } from './write-error'

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

afterEach(() => {
  vi.mocked(toast.error).mockClear()
})

describe('messageFromErrorBody', () => {
  it('reads the problem detail before a validation line', () => {
    expect(messageFromErrorBody({
      title: 'Unprocessable Entity',
      detail: 'key already exists',
      errors: [{ message: 'name is required' }],
    })).toBe('key already exists')
  })

  it('uses the first validation message when detail is missing', () => {
    expect(messageFromErrorBody({ errors: [{ code: 'required', message: 'name is required' }] })).toBe('name is required')
  })
})

describe('writeErrorMessage', () => {
  it('prefers the error body over the status text', () => {
    const error = new ApiError(422, 'Unprocessable Entity', { detail: 'the write failed validation' })
    expect(writeErrorMessage(error)).toBe('the write failed validation')
  })

  it('falls back to the status text when the body has no message', () => {
    const error = new ApiError(500, 'Internal Server Error', { status: 500 })
    expect(writeErrorMessage(error)).toBe('Internal Server Error')
  })

  it('stays quiet for an aborted request', () => {
    const error = new DOMException('The operation was aborted', 'AbortError')
    expect(writeErrorMessage(error)).toBeNull()
  })

  it('stays quiet for a status the caller already handled', () => {
    const error = new ApiError(404, 'Not Found', { detail: 'missing' })
    expect(writeErrorMessage(error, { ignoreStatus: [404] })).toBeNull()
  })
})

describe('reportWriteError', () => {
  it('toasts the server message', () => {
    const error = new ApiError(422, 'Unprocessable Entity', { detail: 'the write failed validation' })
    expect(reportWriteError(error)).toBe('the write failed validation')
    expect(toast.error).toHaveBeenCalledWith('the write failed validation')
  })

  it('does not toast an aborted request or an expected 404', () => {
    expect(reportWriteError(new DOMException('aborted', 'AbortError'))).toBeNull()
    expect(reportWriteError(new ApiError(404, 'Not Found', { detail: 'gone' }), { ignoreStatus: [404] })).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
