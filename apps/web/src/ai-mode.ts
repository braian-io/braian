/** True while Ctrl+J AI mode is the open palette. Link creation then files a proposal. */
let ai = false

export function aiMode() {
  return ai
}

export function setAiMode(next: boolean) {
  ai = next
}
