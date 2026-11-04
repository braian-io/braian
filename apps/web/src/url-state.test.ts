// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseUrlState,
  serializeUrlState,
  useUrlStateSync,
  type UrlStateValues,
  type UrlStateValidity,
} from './url-state'

afterEach(cleanup)

const base: UrlStateValues = {
  workspaceId: 'w1',
  viewId: 'v1',
  catalogId: 'master',
  objectId: null,
}

const valid: UrlStateValidity = {
  workspace: (id) => id === 'w1' || id === 'w2',
  view: (id) => id === 'v1' || id === 'v2',
  catalog: (id) => id === 'master' || id === 'c1',
  object: (id) => id === 'o1' || id === 'o2',
}

function setup(input: {
  search: Record<string, unknown>
  state?: UrlStateValues
  ready?: boolean
}) {
  const navigate = vi.fn()
  const apply = vi.fn()
  const hook = renderHook(
    (props: { search: Record<string, unknown>; state: UrlStateValues; ready: boolean }) =>
      useUrlStateSync({
        search: props.search,
        state: props.state,
        ready: props.ready,
        valid,
        navigate,
        apply,
      }),
    {
      initialProps: {
        search: input.search,
        state: input.state ?? base,
        ready: input.ready ?? true,
      },
    },
  )
  return { navigate, apply, rerender: hook.rerender }
}

describe('URL state params', () => {
  it('parses only known non-empty string params', () => {
    expect(parseUrlState({
      ws: 'w1',
      view: '',
      catalog: 42,
      object: 'o1',
      extra: 'nope',
    })).toEqual({ ws: 'w1', object: 'o1' })
    expect(parseUrlState(null)).toEqual({})
    expect(parseUrlState(['ws'])).toEqual({})
  })

  it('serializes app state and drops empty ids', () => {
    expect(serializeUrlState(base)).toEqual({ ws: 'w1', view: 'v1', catalog: 'master' })
    expect(serializeUrlState({ ...base, workspaceId: null, objectId: 'o1' })).toEqual({
      view: 'v1',
      catalog: 'master',
      object: 'o1',
    })
  })
})

describe('URL sync', () => {
  it('mirrors app state to the URL on first load with replace', () => {
    const { navigate } = setup({ search: {} })
    expect(navigate).toHaveBeenCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master' },
      replace: true,
    })
  })

  it('pushes a Back entry when the view changes', () => {
    const hook = setup({ search: { ws: 'w1', view: 'v1', catalog: 'master' } })
    expect(hook.apply).not.toHaveBeenCalled()
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master' },
      state: { ...base, viewId: 'v2' },
      ready: true,
    })
    expect(hook.navigate).toHaveBeenCalledWith({
      search: { ws: 'w1', view: 'v2', catalog: 'master' },
      replace: false,
    })
  })

  it('mirrors the selected object and pushes a Back entry', () => {
    const hook = setup({ search: { ws: 'w1', view: 'v1', catalog: 'master' } })
    hook.navigate.mockClear()
    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master' },
      state: { ...base, objectId: 'o1' },
      ready: true,
    })
    expect(hook.navigate).toHaveBeenCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      replace: false,
    })
  })

  it('replaces instead of pushing for a catalog-only change', () => {
    const hook = setup({ search: { ws: 'w1', view: 'v1', catalog: 'master' } })
    hook.navigate.mockClear()
    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master' },
      state: { ...base, catalogId: 'c1' },
      ready: true,
    })
    expect(hook.navigate).toHaveBeenCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'c1' },
      replace: true,
    })
  })

  it('applies search params to app state, waiting for a new workspace first', () => {
    const hook = setup({
      search: { ws: 'w2', view: 'v2', catalog: 'c1', object: 'o1' },
      ready: true,
    })
    expect(hook.apply).toHaveBeenLastCalledWith({ workspaceId: 'w2', objectId: 'o1' })

    hook.rerender({
      search: { ws: 'w2', view: 'v2', catalog: 'c1', object: 'o1' },
      state: { workspaceId: 'w2', viewId: 'v1', catalogId: 'master', objectId: 'o1' },
      ready: true,
    })
    expect(hook.apply).toHaveBeenLastCalledWith({ viewId: 'v2', catalogId: 'c1' })
  })

  it('applies a search change from back/forward without touching known params', () => {
    const hook = setup({
      search: { ws: 'w1', view: 'v1', catalog: 'master' },
    })
    hook.apply.mockClear()
    hook.rerender({
      search: { ws: 'w1', view: 'v2', catalog: 'master' },
      state: base,
      ready: true,
    })
    expect(hook.apply).toHaveBeenCalledWith({ viewId: 'v2' })
  })

  it('ignores unknown ids silently', () => {
    const hook = setup({
      search: { ws: 'gone', view: 'gone', catalog: 'gone', object: 'o1' },
      ready: true,
    })
    expect(hook.apply).toHaveBeenCalledWith({ objectId: 'o1' })
    expect(hook.apply).not.toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'gone' }))
  })

  it('does not run until the shell is ready', () => {
    const hook = setup({ search: { ws: 'w1', view: 'v1' }, ready: false })
    expect(hook.apply).not.toHaveBeenCalled()
    expect(hook.navigate).not.toHaveBeenCalled()
  })
})
