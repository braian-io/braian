// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  reportWriteError: vi.fn(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    api: {
      get: mocks.get,
      post: mocks.post,
      put: mocks.put,
      patch: mocks.patch,
      delete: mocks.delete,
    },
  }
})

vi.mock('../write-error', async () => {
  const actual = await vi.importActual<typeof import('../write-error')>('../write-error')
  return { ...actual, reportWriteError: mocks.reportWriteError }
})

const sessionView = {
  id: 'sess-1',
  status: 'previewed',
  types: [],
  file_name: 'orders.csv',
  file_kind: 'csv',
  sheets: [],
  sheet_index: 0,
  headers: [],
  sample: [],
  rows_parsed: 0,
  parse_done: true,
  targets: [],
  proposal: null,
  mapping: null,
  counters: {},
  job_id: null,
  draft_id: null,
  error: null,
}

async function loadController() {
  vi.resetModules()
  return import('./controller')
}

describe('import session deletion', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset()
    mocks.get.mockResolvedValue(sessionView)
  })

  it('deletes the session before clearing it from the UI', async () => {
    const controller = await loadController()
    await controller.attachImport('sess-1')
    expect(controller.getImportSnapshot().session?.id).toBe('sess-1')

    controller.discardImport()

    await vi.waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/v1/imports/{id}', {
      params: { path: { id: 'sess-1' } },
    }))
    await vi.waitFor(() => expect(controller.getImportSnapshot().session).toBeNull())
    expect(mocks.reportWriteError).not.toHaveBeenCalled()
  })

  it('keeps the session and surfaces the error when deletion fails', async () => {
    mocks.delete.mockRejectedValueOnce(new Error('delete failed'))
    const controller = await loadController()
    await controller.attachImport('sess-1')

    controller.discardImport()

    await vi.waitFor(() => expect(mocks.reportWriteError).toHaveBeenCalledTimes(1))
    expect(mocks.reportWriteError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(controller.getImportSnapshot().session?.id).toBe('sess-1')
  })
})
