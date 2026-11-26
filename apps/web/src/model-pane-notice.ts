const STORAGE_KEY = 'braian.model-pane-notice'

export function stashModelPaneNotice(message: string) {
  if (!message || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, message)
  } catch {
    /* ignore quota or private mode */
  }
}

export function takeModelPaneNotice(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = sessionStorage.getItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    return value
  } catch {
    return null
  }
}