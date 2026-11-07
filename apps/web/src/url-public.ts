/**
 * Public URL tokens for the index route.
 *
 * Navigation (`ws`, `view`, `catalog`) uses the same slug rules as
 * `slug_key` in `crates/model/src/link.rs`: ASCII letters and digits stay,
 * lowercased; every other character, including spaces and non-ASCII, becomes
 * `_`; underscores at the ends are trimmed. Consecutive underscores are kept.
 * A name that slugs to nothing has no token — the param is omitted. A UUID is
 * not a fallback.
 *
 * Products (`object`) use the stored object key (SKU) as-is. The query
 * serializer percent-encodes it. The key is not slugified.
 *
 * The current name or key is the only address. A rename changes the token.
 * A previous token is not accepted. When several rows share a slug or a key
 * in the same scope, the lowest id keeps the bare token. Each other row adds
 * `~` plus the shortest unique hex suffix of its id (8, 12, 16, then 32).
 * That suffix is only part of the current token, not a permanent alias.
 */

export type NamedId = { id: string; label: string }
export type KeyedId = { id: string; key: string }

const SHORT_LENGTHS = [8, 12, 16, 32] as const

export function slugify(text: string): string {
  let slug = ''
  for (const ch of text) {
    slug += /[A-Za-z0-9]/.test(ch) ? ch.toLowerCase() : '_'
  }
  return slug.replace(/^_+|_+$/g, '')
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

/** Id -> token. Rows with an empty slug are absent. */
export function assignPublicTokens(items: readonly NamedId[]): Map<string, string> {
  const groups = new Map<string, NamedId[]>()
  for (const item of items) {
    const slug = slugify(item.label)
    if (!slug) continue
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
  if (!match || match.index === 0) return { slug: trimmed }
  const slug = trimmed.slice(0, match.index)
  if (!slug) return null
  return { slug, short: match[1].toLowerCase() }
}

/**
 * Resolve a navigation token. The bare slug is the lowest id in the slug
 * group. A `~suffix` token resolves only when that suffix is what we would
 * emit for that row now.
 */
export function resolvePublicToken(items: readonly NamedId[], token: string): string | null {
  const parsed = splitNavigationToken(token)
  if (!parsed || !parsed.slug) return null
  const matches = items.filter((item) => slugify(item.label) === parsed.slug)
  if (matches.length === 0) return null
  const sorted = [...matches].sort(byId)
  const tokens = assignPublicTokens(sorted)
  if (!parsed.short) return tokens.get(sorted[0].id) === parsed.slug ? sorted[0].id : null
  const found = sorted.filter((item) => tokens.get(item.id) === `${parsed.slug}~${parsed.short}`)
  return found.length === 1 ? found[0].id : null
}

const OBJECT_SUFFIX = /~([0-9a-f]{8,32})$/i

export function splitObjectToken(token: string): { key: string; short?: string } | null {
  if (token.length === 0 || token.trim().length === 0) return null
  const match = OBJECT_SUFFIX.exec(token)
  if (!match || match.index === 0) return { key: token }
  const key = token.slice(0, match.index)
  if (!key) return null
  return { key, short: match[1].toLowerCase() }
}

/** Token for one object among rows that share its resolution scope. */
export function objectTokenFor(item: KeyedId, peers: readonly KeyedId[]): string | null {
  if (!item.key) return null
  const same = peers.filter((peer) => peer.key === item.key)
  const group = same.some((peer) => peer.id === item.id) ? same : [...same, item]
  const sorted = [...group].sort(byId)
  if (sorted[0]?.id === item.id) return item.key
  return `${item.key}~${uniqueSuffix(item.id, sorted)}`
}

/**
 * Resolve `token` against the rows in this catalog/type scope.
 * Returns an id only when `token` is exactly the token we would emit now.
 * Several interpretations (the whole string is a key, and a `~suffix` split
 * is also a key) that point at different rows resolve to nothing.
 */
export function resolveObjectToken(peers: readonly KeyedId[], token: string): string | null {
  const interpretations = new Set<string>()
  for (const peer of peers) {
    if (peer.key !== token) continue
    if (objectTokenFor(peer, peers) === token) interpretations.add(peer.id)
  }
  const split = splitObjectToken(token)
  if (split?.short) {
    for (const peer of peers) {
      if (peer.key !== split.key) continue
      if (objectTokenFor(peer, peers) === token) interpretations.add(peer.id)
    }
  }
  if (interpretations.size !== 1) return null
  return [...interpretations][0]
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
