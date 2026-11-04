import { score, type FrecencyEntry } from './frecency'

export type PaletteGroup = 'recent' | 'best' | 'object' | 'model' | 'views' | 'search' | 'ask'

export type PaletteChip = { text: string; tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' }

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
  best: 'Best match',
  object: 'On selected object',
  model: 'Data model',
  views: 'Views & workspaces',
  search: 'Objects',
}

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

/** Last run first. A higher use count does not outrank a newer run. */
export function recentSlice(
  items: PaletteItem[],
  frecency: Record<string, FrecencyEntry>,
  limit = 4,
): PaletteItem[] {
  return dedupe(items)
    .filter((item) => (frecency[identity(item)]?.uses ?? 0) > 0)
    .sort((left, right) => {
      const last = (frecency[identity(right)]?.last ?? 0) - (frecency[identity(left)]?.last ?? 0)
      if (last !== 0) return last
      return identity(left).localeCompare(identity(right))
    })
    .slice(0, limit)
    .map((item) => ({ ...item, group: 'recent' as const }))
}

function titleOf(item: PaletteItem): string {
  return item.title.toLowerCase().replace(/\s*›\s*$/, '').trim()
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
function stringRank(text: string, needle: string): number {
  if (!text || !needle) return 0
  if (text === needle) return 1000
  if (text.startsWith(needle)) return 800
  const words = wordsOf(text)
  const tokens = needle.split(/\s+/).filter(Boolean)
  if (tokens.length > 1 && coversWords(words, tokens)) return 700
  if (tokens.length === 1 && isInitials(words, tokens[0] ?? '')) return 650
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
  if (!storage || !id || id === 'ask' || item.group === 'ask') return
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

export function visibleRows(
  query: string,
  catalog: PaletteItem[],
  hits: PaletteItem[],
  frecency: Record<string, FrecencyEntry>,
  now = Date.now(),
  memory: PaletteItem[] = [],
): PaletteItem[] {
  const needle = query.trim().toLowerCase()
  const matches = (item: PaletteItem) => !needle || paletteMatchScore(item, needle) > 0
  const pool = dedupe(catalog)
  const scored = [...pool].sort((left, right) => score(frecency[right.id], now) - score(frecency[left.id], now))
  const recent = needle ? [] : recentSlice([...pool, ...memory], frecency)
  const recentIds = new Set(recent.map((item) => identity(item)))
  const matched = scored
    .filter((item) => matches(item) && !recentIds.has(identity(item)))
    .sort(
      (left, right) =>
        paletteMatchScore(right, needle) - paletteMatchScore(left, needle) ||
        (frecency[identity(right)]?.last ?? 0) - (frecency[identity(left)]?.last ?? 0),
    )
  const best = needle ? matched[0] : undefined
  const rest = matched.filter((item) => identity(item) !== (best ? identity(best) : undefined))
  const rows: PaletteItem[] = [
    ...recent,
    ...(best ? [{ ...best, id: `best:${best.id}`, sourceId: best.id, group: 'best' as const }] : []),
    ...rest.filter((item) => item.group === 'object'),
    ...rest.filter((item) => item.group === 'model'),
    ...rest.filter((item) => item.group === 'views'),
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
 * A model draft wins; otherwise the best title match.
 */
export function activeAfterQuery(rows: PaletteItem[], query: string): number | null {
  if (!query.trim()) return null
  const model = rows.findIndex((row) => row.sourceId === 'model:command' || row.sourceId === 'assortment:save')
  if (model >= 0) return model
  const best = rows.findIndex((row) => row.group === 'best')
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
  const recent = recentSlice([...rows, ...extras], frecency)
  const recentIds = new Set(recent.map((item) => identity(item)))
  return [
    ...recent,
    ...rows.filter((item) => !recentIds.has(identity(item))),
  ]
}

export function askIndex(rows: PaletteItem[]) {
  return rows.findIndex((row) => row.group === 'ask')
}
