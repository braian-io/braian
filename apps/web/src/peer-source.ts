import { api, type Json } from './api'

/**
 * Peer object ids of `targetTypeKey` linked to the selected source objects.
 * A failed lookup contributes no rows, never every row.
 */
export async function linkedPeerIds(
  objectIds: string[],
  targetTypeKey: string,
  linkType?: string,
): Promise<string[]> {
  if (!targetTypeKey) return []
  const seen = new Set<string>()
  for (const objectId of objectIds) {
    if (!objectId) continue
    try {
      const sides = await api.get('/v1/links', { params: { query: { object: objectId } } }) as Json[]
      for (const side of sides ?? []) {
        if (linkType && String(side.link_type ?? '') !== linkType) continue
        for (const link of ((side.links as Json[] | undefined) ?? [])) {
          if (String(link.peer_type ?? '') !== targetTypeKey) continue
          const peerId = String(link.peer_id ?? '')
          if (peerId) seen.add(peerId)
        }
      }
    } catch {
      // Ignore one source object; the rest still narrow the table.
    }
  }
  return [...seen]
}
