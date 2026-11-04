/** Link picker or link dialog is open. Global chords stay with that surface. */
let depth = 0

export function linkUiOpen() {
  return depth > 0
}

export function pushLinkUi() {
  depth += 1
  return () => {
    depth = Math.max(0, depth - 1)
  }
}
