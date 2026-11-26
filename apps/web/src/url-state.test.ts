// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { markObjectNavReplace, objectNavReplaceId, resetObjectNavReplace } from './object-nav-signal'
import {
  parseUrlState,
  serializeUrlState,
  useUrlStateSync,
  type UrlStateValues,
  type UrlStateValidity,
} from './url-state'

afterEach(() => {
  cleanup()
  resetObjectNavReplace()
})

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
  viewOpen?: (id: string) => boolean
  forceReplace?: boolean
  navObjectId?: string | null
}) {
  const navigate = vi.fn()
  const apply = vi.fn()
  const hook = renderHook(
    (props: {
      search: Record<string, unknown>
      state: UrlStateValues
      ready: boolean
      viewOpen: ((id: string) => boolean) | undefined
      forceReplace: boolean | undefined
      navObjectId: string | null | undefined
    }) =>
      useUrlStateSync({
        search: props.search,
        state: props.state,
        ready: props.ready,
        valid,
        viewOpen: props.viewOpen,
        forceReplace: props.forceReplace,
        navObjectId: props.navObjectId,
        navigate,
        apply,
      }),
    {
      initialProps: {
        search: input.search,
        state: input.state ?? base,
        ready: input.ready ?? true,
        viewOpen: input.viewOpen,
        forceReplace: input.forceReplace,
        navObjectId: input.navObjectId,
      },
    },
  )
  const rerender = (props: {
    search: Record<string, unknown>
    state: UrlStateValues
    ready: boolean
    viewOpen?: (id: string) => boolean
    forceReplace?: boolean
    navObjectId?: string | null
  }) => hook.rerender({
    ...props,
    viewOpen: props.viewOpen ?? input.viewOpen,
    forceReplace: props.forceReplace ?? input.forceReplace,
    navObjectId: props.navObjectId === undefined ? input.navObjectId : props.navObjectId,
  })
  return { navigate, apply, rerender }
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

  it('does not double-push when two updates land before the URL catches up', () => {
    const hook = setup({ search: { ws: 'w1', view: 'v1', catalog: 'master' } })
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master' },
      state: { ...base, objectId: 'o1' },
      ready: true,
    })
    expect(hook.navigate).toHaveBeenLastCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      replace: false,
    })

    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master' },
      state: { ...base, objectId: 'o2' },
      ready: true,
    })
    expect(hook.navigate).toHaveBeenLastCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o2' },
      replace: true,
    })

    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o2' },
      state: { ...base, objectId: 'o2' },
      ready: true,
    })
    hook.navigate.mockClear()
    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o2' },
      state: { ...base, objectId: 'o1' },
      ready: true,
    })
    expect(hook.navigate).toHaveBeenLastCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      replace: false,
    })
  })

  it('replaces when the write comes from resolving the same target', () => {
    const hook = setup({ search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' } })
    hook.navigate.mockClear()
    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: { ...base, objectId: 'o2' },
      ready: true,
      forceReplace: true,
    })
    expect(hook.navigate).toHaveBeenLastCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o2' },
      replace: true,
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

  it('does not reopen a view that is already open on first load', () => {
    const { navigate, apply } = setup({
      search: { ws: 'w1', view: 'v2', catalog: 'master' },
      state: base,
      viewOpen: (id) => id === 'v2',
    })
    expect(apply).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master' },
      replace: true,
    })
  })

  it('does not push history for state that came from the URL', () => {
    const hook = setup({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: base,
    })
    expect(hook.apply).toHaveBeenCalledWith({ objectId: 'o1' })
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: { ...base, objectId: 'o1' },
      ready: true,
    })
    expect(hook.navigate).not.toHaveBeenCalled()
  })

  it('replaces, not pushes, while a URL-derived workspace settles', () => {
    const hook = setup({ search: { ws: 'w1', view: 'v1', catalog: 'master' } })
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'w2', view: 'v1', catalog: 'master' },
      state: base,
      ready: true,
    })
    expect(hook.apply).toHaveBeenCalledWith({ workspaceId: 'w2' })
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'w2', view: 'v1', catalog: 'master' },
      state: { ...base, workspaceId: 'w2' },
      ready: true,
    })
    hook.navigate.mockClear()

    // The new workspace settles on another view before the URL is updated.
    hook.rerender({
      search: { ws: 'w2', view: 'v1', catalog: 'master' },
      state: { ...base, workspaceId: 'w2', viewId: 'v2' },
      ready: true,
    })
    expect(hook.navigate).toHaveBeenCalledWith({
      search: { ws: 'w2', view: 'v2', catalog: 'master' },
      replace: true,
    })
  })

  it('does not run until the shell is ready', () => {
    const hook = setup({ search: { ws: 'w1', view: 'v1' }, ready: false })
    expect(hook.apply).not.toHaveBeenCalled()
    expect(hook.navigate).not.toHaveBeenCalled()
  })

  it('replaces history only when the URL write is the arrow target', () => {
    const hook = setup({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: { ...base, objectId: 'o1' },
    })
    hook.navigate.mockClear()
    // A stale arrow mark (failed load, or A → B → A) must not replace the next click.
    markObjectNavReplace('uuid-arrow')
    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: { ...base, objectId: 'o2' },
      ready: true,
      navObjectId: 'uuid-clicked',
    })
    expect(hook.navigate).toHaveBeenCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o2' },
      replace: false,
    })
    expect(objectNavReplaceId()).toBeNull()

    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o2' },
      state: { ...base, objectId: 'o2' },
      ready: true,
      navObjectId: 'uuid-clicked',
    })
    hook.navigate.mockClear()
    markObjectNavReplace('uuid-arrow')
    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o2' },
      state: { ...base, objectId: 'o1' },
      ready: true,
      navObjectId: 'uuid-arrow',
    })
    expect(hook.navigate).toHaveBeenCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      replace: true,
    })
  })

  it('does not apply a stale object param while the router is catching up', () => {
    const hook = setup({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: { ...base, objectId: 'o1' },
    })
    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: { ...base, objectId: 'o1' },
      ready: true,
    })
    hook.navigate.mockClear()
    hook.apply.mockClear()

    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: { ...base, objectId: 'o3' },
      ready: true,
    })
    expect(hook.navigate).toHaveBeenCalled()

    hook.apply.mockClear()
    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o2' },
      state: { ...base, objectId: 'o3' },
      ready: true,
    })
    expect(hook.apply).not.toHaveBeenCalledWith(expect.objectContaining({ objectId: 'o2' }))
  })

  it('pushes the next object change when arrowing at the edge did not mark replace', () => {
    const hook = setup({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: { ...base, objectId: 'o1' },
    })
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o1' },
      state: { ...base, objectId: 'o2' },
      ready: true,
    })
    expect(hook.navigate).toHaveBeenCalledWith({
      search: { ws: 'w1', view: 'v1', catalog: 'master', object: 'o2' },
      replace: false,
    })
  })
})
