import { applyLayoutCommand, views as layoutViewIds, type LayoutDoc } from './layout'
import { modelTableDraftDirty } from './model-table-draft'

type DockView = {
  id: string
  type: string
  state?: Record<string, unknown>
  title?: string
}

function viewMode(view: DockView) {
  return String(view.state?.mode ?? '').trim().toLowerCase()
}

function viewTitle(view: DockView) {
  return String(view.title ?? '').trim().toLowerCase()
}

export function isTypeAttributesDockView(view: DockView): boolean {
  if (view.type !== 'data_model') return false
  const mode = viewMode(view)
  if (mode === 'classes' || mode === 'attributes') return true
  return viewTitle(view) === 'attributes' || viewTitle(view) === 'type attributes'
}

export function layoutLeavesTypeAttributes(
  dockViews: DockView[],
  before: LayoutDoc,
  after: LayoutDoc,
): boolean {
  if (!modelTableDraftDirty()) return false
  const focus = before.focus
  if (!focus) return false
  const focused = dockViews.find((view) => view.id === focus)
  if (!focused || !isTypeAttributesDockView(focused)) return false
  const afterOpen = layoutViewIds(after.layout)
  if (!afterOpen.includes(focus)) return true
  if (after.focus !== focus) return true
  return false
}

export function layoutCommandLeavesTypeAttributes(
  dockViews: DockView[],
  doc: LayoutDoc,
  name: string,
  args: Record<string, unknown>,
): boolean {
  const refs = dockViews.map((view) => ({ id: view.id, title: view.title ?? '', type: view.type }))
  const result = applyLayoutCommand(doc, name, args, { views: refs })
  if (!result.handled) return false
  return layoutLeavesTypeAttributes(dockViews, doc, result.doc)
}