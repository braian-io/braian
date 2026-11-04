const storageKey = 'braian.shortcut.tips'

type TipState = { shown: number; used: boolean }

const moveSentence: Record<string, string> = {
  'Ctrl+Alt+←': 'moves the view left',
  'Ctrl+Alt+→': 'moves the view right',
  'Ctrl+Alt+↑': 'moves the view up',
  'Ctrl+Alt+↓': 'moves the view down',
}

export function shortcutTipCopy(chord: string, description: string): string {
  const known = moveSentence[chord]
  const sentence = known ?? description.trim().charAt(0).toLowerCase() + description.trim().slice(1)
  return `Tip: ${chord} ${sentence}`
}

function readTips(storage: Storage | null): Record<string, TipState> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as Record<string, TipState>) : {}
  } catch {
    return {}
  }
}

function writeTips(storage: Storage | null, tips: Record<string, TipState>) {
  storage?.setItem(storageKey, JSON.stringify(tips))
}

/** At most three times, and never after the shortcut itself has been used. */
export function takeShortcutTip(
  id: string,
  chord: string,
  description: string,
  storage: Storage | null = localStorageOrNull(),
): string | null {
  if (!id || !chord) return null
  const tips = readTips(storage)
  const state = tips[id] ?? { shown: 0, used: false }
  if (state.used || state.shown >= 3) return null
  tips[id] = { shown: state.shown + 1, used: false }
  writeTips(storage, tips)
  return shortcutTipCopy(chord, description)
}

export function markShortcutUsed(id: string, storage: Storage | null = localStorageOrNull()) {
  if (!id) return
  const tips = readTips(storage)
  const state = tips[id] ?? { shown: 0, used: false }
  tips[id] = { ...state, used: true }
  writeTips(storage, tips)
}

export function announce(message: string) {
  const node = document.getElementById('braian-live')
  if (node) node.textContent = message
}

function localStorageOrNull() {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}
