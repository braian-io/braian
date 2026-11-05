import { score, type FrecencyEntry } from './frecency'

export type PaletteGroup =
  | 'recent'
  | 'navigation'
  | 'create'
  | 'model'
  | 'links'
  | 'search'
  | 'ask'
  | 'views'
  | 'best'
  | 'object'

export type PaletteChip = { text: string; tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent' }

/** A command argument the palette turns into a sub-list. `type` comes from the operation schema. */
export type PaletteArgument = { name: string; type: string }

export type PaletteItem = {
  id: string
  group: PaletteGroup
  title: string
  subtitle: string
  kbd?: string
  shortcut?: string
  sourceId?: string
  chips?: PaletteChip[]
  keywords?: string[]
  typeKey?: string
  /** A row that is explained but cannot be chosen (e.g. a source cycle). */
  disabled?: boolean
  /** Enter and Tab push a searchable sub-list for this argument. */
  argument?: PaletteArgument
  /** A view, workspace, or object. Ctrl+K and Ctrl+Enter open its action panel. */
  entity?: boolean
}

export const groupTitle: Record<Exclude<PaletteGroup, 'ask'>, string> = {
  recent: 'Recent',
  navigation: 'Navigation',
  create: 'Create',
  model: 'Data model',
  links: 'Links',
  search: 'Objects',
  views: 'Navigation',
  best: 'Navigation',
  object: 'Navigation',
}

export const groupOrder: PaletteGroup[] = ['recent', 'navigation', 'create', 'model', 'links', 'search', 'ask']

export function askTitle(query: string) {
  const text = query.trim()
  return text ? `Ask AI: "${text}"` : 'Ask AI'
}


const memoryKey = 'braian.palette.rows'

/** Shared action subtitles. They must not pull every view into a command search. */
function genericActionSubtitle(subtitle: string): boolean {
  return /^(open view|open workspace|open object)$/i.test(subtitle.trim())
}

export function paletteHaystack(item: PaletteItem): string {
  const title = item.title.replace(/\s*›\s*$/, '')
  const keywords = (item.keywords ?? []).join(' ')
  const subtitle = genericActionSubtitle(item.subtitle) && !item.argument ? '' : item.subtitle
  return `${title} ${subtitle} ${keywords}`
}

function identity(item: PaletteItem): string {
  if (item.id.startsWith('best:') && item.sourceId) return item.sourceId
  return item.id
}

function dedupe(items: PaletteItem[]): PaletteItem[] {
  const seen = new Set<string>()
  const out: PaletteItem[] = []
  for (const item of items) {
    const id = identity(item)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(item)
  }
  return out
}

/**
 * Views, objects, workspaces, and drill-ins are worth remembering.
 * Layout moves, resets, theme toggles, and other shortcut commands are not.
 */
export function rememberRecent(item: PaletteItem): boolean {
  const id = frecencyId(item)
  if (!id || id === 'ask' || item.group === 'ask') return false
  if (id.startsWith('layout:') || id.startsWith('theme:')) return false
  if (item.argument || /›\s*$/.test(item.title)) return true
  if (/^(view|workspace|hit|type-view):/.test(id)) return true
  if (item.shortcut || item.kbd) return false
  return false
}

/** Last run first. A higher use count does not outrank a newer run. */
export function recentSlice(
  items: PaletteItem[],
  frecency: Record<string, FrecencyEntry>,
  limit = 4,
  live?: Set<string>,
): PaletteItem[] {
  return dedupe(items)
    .filter((item) => rememberRecent(item))
    .filter((item) => (frecency[identity(item)]?.uses ?? 0) > 0)
    .filter((item) => !live || live.has(identity(item)))
    .sort((left, right) => {
      const last = (frecency[identity(right)]?.last ?? 0) - (frecency[identity(left)]?.last ?? 0)
      if (last !== 0) return last
      const frec = score(frecency[identity(right)]) - score(frecency[identity(left)])
      if (frec !== 0) return frec
      return labelOrder(left, right)
    })
    .slice(0, limit)
    .map((item) => ({ ...item, group: 'recent' as const }))
}

function isCreateId(id: string): boolean {
  if (id.startsWith('place:') || id.startsWith('open:') || id.startsWith('right:') || id.startsWith('copy:')) return false
  return (
    id === 'workspace:new'
    || id === 'import:file'
    || id === 'layout:add-view'
    || id === 'selection:new'
    || id === 'attr:new'
    || id.startsWith('model:new-')
  )
}

/** Heading a row belongs under. Link commands leave Views. Create leaves Data model. */
export function paletteSection(item: PaletteItem): PaletteGroup {
  if (item.group === 'recent') return 'recent'
  if (item.group === 'ask' || item.id === 'ask') return 'ask'
  const id = frecencyId(item)
  if (item.group === 'search' || id.startsWith('hit:')) return 'search'
  if (item.group === 'links' || id.startsWith('link:')) return 'links'
  if (isCreateId(id)) return 'create'
  if (
    item.group === 'model'
    || id.startsWith('model:')
    || id.startsWith('attr:')
    || id === 'goto:attribute-definitions'
  ) return 'model'
  return 'navigation'
}

function assignSection(item: PaletteItem): PaletteItem {
  const section = paletteSection(item)
  return section === item.group ? item : { ...item, group: section }
}

/** Drop "Products view" when a saved view already opens Products. */
export function withoutDuplicateDestinations(items: PaletteItem[]): PaletteItem[] {
  const saved = new Set(
    items
      .filter((item) => item.id.startsWith('view:') || item.id.startsWith('add-view:view:'))
      .map((item) => item.title.trim().toLowerCase()),
  )
  return items.filter((item) => {
    if (!item.id.startsWith('type-view:') && !item.id.startsWith('add-view:type:')) return true
    const plural = item.title.replace(/\s+view$/i, '').trim().toLowerCase()
    return !saved.has(plural)
  })
}

function titleOf(item: PaletteItem): string {
  return item.title.toLowerCase().replace(/\s*›\s*$/, '').trim()
}

/** Equal rank and frecency: alphabetical label, then id only when the labels match. */
function labelOrder(left: PaletteItem, right: PaletteItem): number {
  const byLabel = titleOf(left).localeCompare(titleOf(right), 'en')
  if (byLabel !== 0) return byLabel
  return identity(left).localeCompare(identity(right))
}

/** Polite live-region text. An empty query says nothing. */
export function resultAnnouncement(count: number, query: string): string {
  if (!query.trim()) return ''
  return count === 1 ? '1 result' : `${count} results`
}

/** A command, as opposed to a view, workspace, template, or object row. */
function isCommandRow(item: PaletteItem): boolean {
  if (item.argument || /›\s*$/.test(item.title)) return true
  if (item.group === 'ask' || item.group === 'search' || item.entity) return false
  const id = frecencyId(item)
  return !/^(view|workspace|hit|type-view|template|saved-template):/.test(id)
}

function wordsOf(value: string): string[] {
  return value.split(/[\s\-_./]+/).filter(Boolean)
}

/** Each token is a prefix of a later word: "open v" matches "open view". */
function coversWords(words: string[], tokens: string[]): boolean {
  let from = 0
  for (const token of tokens) {
    let found = -1
    for (let index = from; index < words.length; index += 1) {
      if (words[index]?.startsWith(token)) {
        found = index
        break
      }
    }
    if (found < 0) return false
    from = found + 1
  }
  return true
}

/** "ov" matches the initials of "open view". */
function isInitials(words: string[], needle: string): boolean {
  if (needle.length < 2 || needle.length > words.length) return false
  return needle.split('').every((char, index) => words[index]?.startsWith(char))
}

/**
 * Sequential fuzzy score in 0..1. Consecutive characters and word starts
 * score higher than jumps inside a word. Missing characters score 0.
 */
function fuzzyScore(text: string, needle: string): number {
  let score = 1
  let from = 0
  let previous = -1
  for (const char of needle) {
    const index = text.indexOf(char, from)
    if (index < 0) return 0
    if (previous >= 0) {
      const boundary = text[index - 1]
      if (index === previous + 1) score *= 1
      else if (boundary === ' ' || boundary === '-' || boundary === '/') score *= 0.9
      else score *= 0.3 * 0.95 ** (index - previous - 1)
    }
    previous = index
    from = index + 1
  }
  if (text.length !== needle.length) score *= 0.99
  return score
}

/**
 * Higher is better. Exact and prefix beat word prefixes, initials, substrings,
 * then a weaker fuzzy score. Command-name hits at initials or stronger add a
 * bonus so they outrank an item with a better string score.
 */
/** A little higher when the query covers more of the title. Stays under an exact match (1000). */
function prefixRank(text: string, needle: string): number {
  return 800 + Math.round((30 * needle.length) / Math.max(text.length, 1))
}

function stringRank(text: string, needle: string): number {
  if (!text || !needle) return 0
  if (text === needle) return 1000
  if (text.startsWith(needle)) return prefixRank(text, needle)
  const words = wordsOf(text)
  const tokens = needle.split(/\s+/).filter(Boolean)
  if (tokens.length > 1 && coversWords(words, tokens)) return 700
  if (tokens.length === 1 && isInitials(words, tokens[0] ?? '')) return 650
  if (tokens.length === 1 && words.some((word) => word.startsWith(tokens[0] ?? '') && (tokens[0]?.length ?? 0) >= 2)) return 720
  if (text.includes(needle)) return 400
  const fuzzy = fuzzyScore(text, needle)
  // Long jumps (a query stretched across an unrelated sentence) stay out of the list.
  if (fuzzy < 0.2) return 0
  return Math.round(fuzzy * 300)
}

const commandNameBonus = 500

/** Rank for sorting and filtering. Zero means the row does not match. */
export function paletteMatchScore(item: PaletteItem, needle: string): number {
  const query = needle.trim().toLowerCase()
  if (!query) return 1
  const title = titleOf(item)
  const titleScore = stringRank(title, query)
  const haystack = paletteHaystack(item).toLowerCase()
  const extraScore = haystack === title ? 0 : Math.min(stringRank(haystack, query), 399)
  const score = Math.max(titleScore, extraScore)
  if (score <= 0) return 0
  if (isCommandRow(item) && titleScore >= 650) return score + commandNameBonus
  return score
}

/** Id stored in frecency for a row, including a Best match copy of that row. */
export function frecencyId(item: PaletteItem): string {
  if ((item.group === 'best' || item.id.startsWith('best:')) && item.sourceId) return item.sourceId
  return item.id
}

/** Object id for a search hit, including one copied into Recent or Best match. */
export function selectedObjectId(item: PaletteItem): string | null {
  const raw = item.id.startsWith('best:') ? item.id.slice('best:'.length) : item.id
  if (raw.startsWith('hit:')) return raw.slice('hit:'.length)
  if (item.sourceId?.startsWith('hit:')) return item.sourceId.slice('hit:'.length)
  if (item.group === 'search' && item.sourceId) return item.sourceId
  return null
}

type MemoryRow = { id: string; title: string; subtitle: string; group: PaletteGroup; typeKey?: string }

function memoryGroup(item: PaletteItem): PaletteGroup {
  const id = frecencyId(item)
  if (id.startsWith('hit:')) return 'search'
  if (item.group === 'recent' || item.group === 'best') return 'views'
  return item.group
}

export function rememberPaletteItem(item: PaletteItem, storage: Storage | null = localStorageOrNull()) {
  const id = frecencyId(item)
  if (!storage || !rememberRecent(item)) return
  const all = readMemoryMap(storage)
  all[id] = {
    id,
    title: item.title,
    subtitle: item.subtitle,
    group: memoryGroup(item),
    ...(item.typeKey ? { typeKey: item.typeKey } : {}),
  }
  storage.setItem(memoryKey, JSON.stringify(all))
}

export function readPaletteMemory(storage: Storage | null = localStorageOrNull()): PaletteItem[] {
  return Object.values(readMemoryMap(storage)).map((row) => ({
    id: row.id,
    group: row.group,
    title: row.title,
    subtitle: row.subtitle,
    ...(row.typeKey ? { typeKey: row.typeKey } : {}),
  }))
}

function readMemoryMap(storage: Storage | null): Record<string, MemoryRow> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(memoryKey)
    return raw ? (JSON.parse(raw) as Record<string, MemoryRow>) : {}
  } catch {
    return {}
  }
}

function localStorageOrNull() {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

/** Filter already-built palette rows by the query (used for cmdk submenus). */
export function filterPaletteRows(rows: PaletteItem[], query: string): PaletteItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  return rows
    .filter((item) => paletteMatchScore(item, needle) > 0)
    .sort((left, right) => paletteMatchScore(right, needle) - paletteMatchScore(left, needle))
}

function compareRank(
  left: PaletteItem,
  right: PaletteItem,
  needle: string,
  frecency: Record<string, FrecencyEntry>,
  now: number,
): number {
  const rank = paletteMatchScore(right, needle) - paletteMatchScore(left, needle)
  if (rank !== 0) return rank
  const frec = score(frecency[identity(right)], now) - score(frecency[identity(left)], now)
  if (frec !== 0) return frec
  const last = (frecency[identity(right)]?.last ?? 0) - (frecency[identity(left)]?.last ?? 0)
  if (last !== 0) return last
  return labelOrder(left, right)
}

export function visibleRows(
  query: string,
  catalog: PaletteItem[],
  hits: PaletteItem[],
  frecency: Record<string, FrecencyEntry>,
  now = Date.now(),
  memory: PaletteItem[] = [],
  openObjectId?: string | null,
): PaletteItem[] {
  const needle = query.trim().toLowerCase()
  const pool = dedupe(withoutDuplicateDestinations(catalog))
  const live = new Set<string>([...pool, ...hits].map((item) => identity(item)))
  if (openObjectId) live.add(`hit:${openObjectId}`)
  const remembered = memory.filter((item) => live.has(identity(item)))
  const recent = needle ? [] : recentSlice([...pool, ...remembered, ...hits], frecency, 4, live)
  const recentIds = new Set(recent.map((item) => identity(item)))
  const matched = pool
    .filter((item) => (!needle || paletteMatchScore(item, needle) > 0) && !recentIds.has(identity(item)))
    .sort((left, right) => compareRank(left, right, needle, frecency, now))
    .map(assignSection)
  const sections: PaletteGroup[] = ['navigation', 'create', 'model', 'links']
  const rows: PaletteItem[] = [
    ...recent,
    ...sections.flatMap((section) => matched.filter((item) => item.group === section)),
    ...hits.map((item) => ({ ...item, group: 'search' as const })),
    {
      id: 'ask',
      group: 'ask',
      title: askTitle(query),
      subtitle: '',
      kbd: 'Ctrl+J',
    },
  ]
  return rows
}

/**
 * Index to highlight while the query is non-empty.
 * A model draft wins; otherwise the highest command-name match.
 */
export function activeAfterQuery(rows: PaletteItem[], query: string): number | null {
  if (!query.trim()) return null
  const model = rows.findIndex((row) => row.sourceId === 'model:command' || row.sourceId === 'assortment:save')
  if (model >= 0) return model
  let best = -1
  let bestScore = 0
  rows.forEach((row, index) => {
    if (row.group === 'ask' || row.group === 'recent') return
    const value = paletteMatchScore(row, query)
    if (value > bestScore) {
      bestScore = value
      best = index
    }
  })
  return best >= 0 ? best : null
}

/** Recent rows at the top of a sub-list. A query hides them so the matches stay first. */
export function withRecent(
  rows: PaletteItem[],
  frecency: Record<string, FrecencyEntry>,
  _now = Date.now(),
  query = '',
  extras: PaletteItem[] = [],
): PaletteItem[] {
  if (query.trim()) return rows
  const live = new Set(rows.map((item) => identity(item)))
  const recent = recentSlice([...rows, ...extras.filter((item) => live.has(identity(item)))], frecency, 4, live)
  const recentIds = new Set(recent.map((item) => identity(item)))
  return [
    ...recent,
    ...rows.filter((item) => !recentIds.has(identity(item))),
  ]
}

const dialogIds = new Set([
  'workspace:delete',
  'feedback:send',
  'selection:delete',
  'model:delete-type',
  'model:delete-link-type',
  'model:delete-structure',
  'model:delete-list',
  'model:delete-option',
  'model:delete-family',
  'model:delete-unit',
  'model:delete-attribute',
  'model:delete-group',
  'attr:delete',
])

/** › stays on drill-ins. Commands that open a dialog end with …. */
export function markedTitle(item: PaletteItem): string {
  const title = item.title.trim()
  if (/[›…]\s*$/.test(title)) return title
  const id = frecencyId(item)
  if (dialogIds.has(id) || dialogIds.has(item.id)) return `${title}…`
  return title
}

export function sublistPlaceholder(frame: { label: string; paramType?: string }, plurals: string[] = []): string {
  if (frame.paramType === 'agent' || /\bagents?\b/i.test(frame.label)) return 'Search agents…'
  if (frame.paramType === 'view' || /\bview\b/i.test(frame.label)) return 'Search views…'
  if (frame.paramType === 'workspace' || /\bworkspace\b/i.test(frame.label)) return 'Search workspaces…'
  const plural = plurals.find((name) => name && frame.paramType && name.toLowerCase().startsWith(frame.paramType.toLowerCase()))
  if (plural) return `Search ${plural.toLowerCase()}…`
  if (frame.paramType === 'object' || /\b(product|object)\b/i.test(frame.label)) return 'Search objects…'
  return 'Search…'
}

export function askIndex(rows: PaletteItem[]) {
  return rows.findIndex((row) => row.group === 'ask')
}
