/** Shared flag so Ctrl+K can hide "Reload to new version" until a poll finds one.
 * Stored on globalThis so Vite client chunks share one value (module copies would diverge).
 */
const KEY = '__braianNewVersionGate'

export function setNewVersionGate(next: boolean) {
  ;(globalThis as unknown as Record<string, boolean>)[KEY] = next
}

export function newVersionGateOpen(): boolean {
  return Boolean((globalThis as unknown as Record<string, boolean | undefined>)[KEY])
}

export function resetNewVersionGate() {
  setNewVersionGate(false)
}
