/**
 * Public URL tokens for the index route.
 *
 * Navigation (`ws`, `view`, `catalog`) uses Unicode letters and digits,
 * NFKC-normalized and lowercased; every other character, including spaces and
 * punctuation, becomes `_`; underscores at the ends are trimmed. Consecutive
 * underscores are kept. A name that slugs to nothing gets a short id fallback
 * token (`~` plus the id suffix). A UUID is not a fallback.
 *
 * Products (`object`) use the stored object key (SKU). A literal `~` in a key
 * is escaped as `~~`, so a trailing `~` plus hex can only be a collision
 * suffix. Keyless rows (for example link objects) get `~` plus the shortest
 * unique hex suffix of their id in the catalog-wide keyless scope. The query
 * serializer percent-encodes the token. The key is not slugified.
 *
 * The current name or key is the only address. A rename changes the token.
 * A previous token is not accepted. When several rows share a slug or a key
 * in the same scope, the lowest id keeps the bare token. Each other row adds
 * `~` plus the shortest unique hex suffix of its id (8, 12, 16, then 32).
 * Keyless rows always carry a suffix, extended the same way when peers share
 * the short tail. That suffix is only part of the current token, not a
 * permanent alias.
 */

export type NamedId = { id: string; label: string }
export type KeyedId = { id: string; key: string | null }

const SHORT_LENGTHS = [8, 12, 16, 32] as const
const SLUG_CHAR = /[\p{L}\p{N}\p{M}]/u
const SLUG_WORD = /[\p{L}\p{N}]/u

export function slugify(text: string): string {
  let slug = ''
  let word = false
  const normalized = text.normalize('NFKC').toLowerCase().normalize('NFKC')
  for (const ch of normalized) {
    if (SLUG_CHAR.test(ch)) {
      slug += ch
      if (SLUG_WORD.test(ch)) word = true
    } else {
      slug += '_'
    }
  }
  // A mark-only name (for example a lone combining accent) is not readable.
  // Keep marks inside a word, but fall back when no letter or digit remains.
  return word ? slug.replace(/^_+|_+$/g, '') : ''
}

export function idHex(id: string): string {
  return id.replace(/-/g, '').toLowerCase()
}

/** Hex suffix of `id`. Length is clamped to the hex form. */
export function shortId(id: string, length = 8): string {
  const hex = idHex(id)
  if (length >= hex.length) return hex
  return hex.slice(-length)
}

/** Hex prefix of `id`. Length is clamped to the hex form. */
export function idPrefix(id: string, length = 8): string {
  return idHex(id).slice(0, length)
}

function byId(left: { id: string }, right: { id: string }): number {
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

function uniqueSuffix(id: string, group: readonly { id: string }[]): string {
  const hex = idHex(id)
  for (const length of SHORT_LENGTHS) {
    const token = hex.length <= length ? hex : hex.slice(-length)
    const hits = group.filter((item) => {
      const other = idHex(item.id)
      const suffix = other.length <= token.length ? other : other.slice(-token.length)
      return suffix === token
    })
    if (hits.length === 1) return token
  }
  return hex
}

/** Id -> token. A name with no letters or digits gets a short id fallback. */
export function assignPublicTokens(items: readonly NamedId[]): Map<string, string> {
  const groups = new Map<string, NamedId[]>()
  const empty: NamedId[] = []
  for (const item of items) {
    const slug = slugify(item.label)
    if (!slug) {
      empty.push(item)
      continue
    }
    const list = groups.get(slug) ?? []
    list.push(item)
    groups.set(slug, list)
  }
  const tokens = new Map<string, string>()
  for (const [slug, group] of groups) {
    const sorted = [...group].sort(byId)
    sorted.forEach((item, index) => {
      tokens.set(item.id, index === 0 ? slug : `${slug}~${uniqueSuffix(item.id, sorted)}`)
    })
  }
  for (const item of empty) {
    tokens.set(item.id, `~${uniqueSuffix(item.id, empty)}`)
  }
  return tokens
}

export function publicToken(items: readonly NamedId[], id: string | null): string | null {
  if (!id) return null
  return assignPublicTokens(items).get(id) ?? null
}

const NAV_SUFFIX = /~([0-9a-f]{8,32})$/i

export function splitNavigationToken(token: string): { slug: string; short?: string } | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  const match = NAV_SUFFIX.exec(trimmed)
  if (!match) return { slug: trimmed }
  if (match.index === 0) return { slug: '', short: match[1].toLowerCase() }
  const slug = trimmed.slice(0, match.index)
  if (!slug) return null
  return { slug, short: match[1].toLowerCase() }
}

/**
 * Resolve a navigation token against the current names. Only the token we
 * would emit now is accepted; a stale slug or suffix is not.
 */
export function resolvePublicToken(items: readonly NamedId[], token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  const tokens = assignPublicTokens(items)
  let found: string | null = null
  for (const [id, value] of tokens) {
    if (value !== trimmed) continue
    if (found !== null) return null
    found = id
  }
  return found
}

const OBJECT_SUFFIX = /^[0-9a-f]{8,32}$/i

/** Escape a literal `~` so a suffix can only be the separator we emitted. */
export function encodeObjectKey(key: string): string {
  return key.replace(/~/g, '~~')
}

export function splitObjectToken(token: string): { key: string; short?: string } | null {
  if (token.length === 0 || token.trim().length === 0) return null
  let key = ''
  for (let index = 0; index < token.length; index += 1) {
    const ch = token[index]
    if (ch !== '~') {
      key += ch
      continue
    }
    if (token[index + 1] === '~') {
      key += '~'
      index += 1
      continue
    }
    const short = token.slice(index + 1)
    if (!OBJECT_SUFFIX.test(short)) return null
    return { key, short: short.toLowerCase() }
  }
  return { key }
}

/** Token for one object among rows that share its resolution scope. */
export function objectTokenFor(item: KeyedId, peers: readonly KeyedId[]): string | null {
  if (!item.key) {
    // UUIDv7 starts with a millisecond timestamp, so the first hex digits are
    // shared by every row created in the same minute. The random suffix is the
    // disambiguator, extended when keyless peers share their short tail.
    const keyless = peers.filter((peer) => !peer.key)
    const group = keyless.some((peer) => peer.id === item.id) ? keyless : [...keyless, item]
    return `~${uniqueSuffix(item.id, group)}`
  }
  const same = peers.filter((peer) => peer.key === item.key)
  const group = same.some((peer) => peer.id === item.id) ? same : [...same, item]
  const sorted = [...group].sort(byId)
  const base = encodeObjectKey(item.key)
  if (sorted[0]?.id === item.id) return base
  return `${base}~${uniqueSuffix(item.id, sorted)}`
}

/**
 * Resolve `token` against the rows in this catalog/type scope.
 * Every token is accepted only when it is exactly what we would emit now.
 * A keyless `~suffix` token must equal the canonical extended suffix for its
 * row; several matches fail closed, and a shorter, longer or stale suffix is
 * not an alias.
 */
export function resolveObjectToken(peers: readonly KeyedId[], token: string): string | null {
  const split = splitObjectToken(token)
  if (!split) return null
  if (!split.key) {
    if (!split.short) return null
    // Accept only the exact token we would emit now. The lookup is scoped by
    // the tail shared by every possible candidate, so `peers` holds the whole
    // collision group and the extended suffix can be recomputed.
    const matches = peers.filter((peer) => !peer.key && objectTokenFor(peer, peers) === token)
    return matches.length === 1 ? matches[0].id : null
  }
  const matches = peers.filter((peer) => peer.key === split.key && objectTokenFor(peer, peers) === token)
  return matches.length === 1 ? matches[0].id : null
}

type DefsLike = {
  types?: Array<{ id?: string; key?: string; key_attribute?: string }>
  attributes?: Array<{ id?: string; key?: string }>
}

/** Object key copied from the type's key attribute. Empty when the row has none. */
export function objectKeyFromValues(
  typeKey: string,
  values: Record<string, unknown> | undefined,
  defs: unknown,
): string | null {
  const model = (defs ?? {}) as DefsLike
  const objectType = (model.types ?? []).find((item) => item.key === typeKey || item.id === typeKey)
  const attributeId = objectType?.key_attribute
  const attribute = (model.attributes ?? []).find((item) => item.id === attributeId || item.key === attributeId)
  const name = attribute?.key
  if (!name || !values) return null
  const raw = values[name]
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}
