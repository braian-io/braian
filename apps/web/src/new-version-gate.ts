/** Module flag so Ctrl+K can hide "Reload to new version" until a poll finds one. */
let available = false

export function setNewVersionGate(next: boolean) {
  available = next
}

export function newVersionGateOpen(): boolean {
  return available
}

export function resetNewVersionGate() {
  available = false
}
