import { applyLayoutCommand, type LayoutDoc, type Node } from './layout'
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

/** Views the dock actually mounts. Focus alone does not unmount a pane. */
export function shownLayoutViewIds(doc: LayoutDoc): string[] {
  if (doc.zoom) return [doc.zoom]
  const shown: string[] = []
  const walk = (node: Node) => {
    if (node.type === 'tabs') {
      const id = node.views[node.active]
      if (id) shown.push(id)
      return
    }
    for (const child of node.children) walk(child)
  }
  walk(doc.layout)
  return shown
}

export function layoutLeavesTypeAttributes(
  dockViews: DockView[],
  before: LayoutDoc,
  after: LayoutDoc,
): boolean {
  if (!modelTableDraftDirty()) return false
  const attributeViews = new Set(dockViews.filter(isTypeAttributesDockView).map((view) => view.id))
  if (attributeViews.size === 0) return false
  const beforeFocus = before.focus
  if (beforeFocus && attributeViews.has(beforeFocus) && after.focus !== beforeFocus) {
    return true
  }
  const beforeShown = shownLayoutViewIds(before).filter((id) => attributeViews.has(id))
  if (beforeShown.length === 0) return false
  const afterShown = new Set(shownLayoutViewIds(after))
  return beforeShown.some((id) => !afterShown.has(id))
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
