export const openTrashTableEvent = 'braian-open-trash-table'

export function requestOpenTrashTable() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(openTrashTableEvent))
}