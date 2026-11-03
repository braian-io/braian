import { textValue, type Json } from './api'
import { expandStructure, type Scene, type SceneEdge, type SceneNode } from './graph-scene'
import { copy, uiLanguage } from './i18n'

type ModelStats = { by_type?: Json[] }

function labelOf(item: Json | undefined) {
  if (!item) return ''
  return (
    textValue(item.labels, uiLanguage) ||
    textValue(item.singular, uiLanguage) ||
    String(item.key ?? '')
  )
}

function typesOf(defs: Json | undefined) {
  return (defs?.types as Json[] | undefined) ?? []
}

function structuresOf(defs: Json | undefined) {
  return (defs?.structures as Json[] | undefined) ?? []
}

function resolveType(defs: Json | undefined, token: unknown) {
  const text = String(token ?? '')
  if (!text) return undefined
  return typesOf(defs).find((item) => String(item.id ?? '') === text || String(item.key ?? '') === text)
}

function resolveStructure(defs: Json | undefined, token: unknown) {
  const text = String(token ?? '')
  if (!text) return undefined
  return structuresOf(defs).find((item) => String(item.id ?? '') === text || String(item.key ?? '') === text)
}

function typeNodeId(key: string) {
  return `type:${key}`
}

function edgeId(linkKey: string, fromKey: string, toKey: string) {
  return `model:${linkKey}:${fromKey}:${toKey}`
}

/** `one` stays singular, anything else reads as many. */
export function cardinalityMark(value: unknown) {
  return String(value) === 'one' ? '1' : 'n'
}

export function linkEdgeLabel(name: string, spec: Json) {
  return `${name} ${cardinalityMark(spec.from_cardinality)}–${cardinalityMark(spec.to_cardinality)}`
}

function countMap(stats: Json | undefined) {
  const counts = new Map<string, number>()
  for (const row of ((stats as ModelStats | undefined)?.by_type ?? [])) {
    const key = String(row.type ?? '')
    const count = Number(row.count)
    if (!key || !Number.isFinite(count)) continue
    counts.set(key, count)
  }
  return counts
}

/**
 * Read-only scene for the data model: one node per object type and one edge per
 * link type and from/to type pair. No objects are fetched or placed here.
 */
export function buildModelScene(defs: Json | undefined, stats?: Json): Scene {
  const counts = countMap(stats)
  const nodes: SceneNode[] = []
  const edges: SceneEdge[] = []
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()

  for (const item of typesOf(defs)) {
    if (item.kind === 'link') continue
    const key = String(item.key ?? '')
    if (!key) continue
    const id = typeNodeId(key)
    if (seenNodes.has(id)) continue
    seenNodes.add(id)
    const caption = labelOf(item) || key
    const count = counts.get(key) ?? 0
    nodes.push({
      id,
      kind: 'type',
      caption,
      subtitle: String(count),
      rawCaption: caption === key,
      typeKey: key,
      typeName: caption,
      properties: [
        { label: copy.type, value: caption },
        { label: copy.key, value: key },
        { label: copy.objects, value: String(count) },
      ],
    })
  }

  for (const item of typesOf(defs)) {
    if (item.kind !== 'link') continue
    const linkKey = String(item.key ?? '')
    const spec = item.link as Json | undefined
    if (!linkKey || !spec) continue
    const fromTypes = ((spec.from_types as unknown[]) ?? []).map(String)
    const toTypes = ((spec.to_types as unknown[]) ?? []).map(String)
    const name = labelOf(item) || linkKey
    for (const fromToken of fromTypes) {
      const from = resolveType(defs, fromToken)
      const fromKey = String(from?.key ?? '')
      if (!fromKey) continue
      for (const toToken of toTypes) {
        const to = resolveType(defs, toToken)
        const toKey = String(to?.key ?? '')
        if (!toKey) continue
        const id = edgeId(linkKey, fromKey, toKey)
        if (seenEdges.has(id)) continue
        seenEdges.add(id)
        edges.push({
          id,
          source: typeNodeId(fromKey),
          target: typeNodeId(toKey),
          label: linkEdgeLabel(name, spec),
        })
      }
    }
  }

  return { nodes, edges }
}

export function mergeModelScene(base: Scene, extra: Scene): Scene {
  const nodes = new Map(base.nodes.map((node) => [node.id, node]))
  for (const node of extra.nodes) if (!nodes.has(node.id)) nodes.set(node.id, node)
  const edges = new Map(base.edges.map((edge) => [edge.id, edge]))
  for (const edge of extra.edges) if (!edges.has(edge.id)) edges.set(edge.id, edge)
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

/** Expanding a type reveals the structure groups it belongs to. */
export function expandModelType(defs: Json | undefined, typeKey: string): Scene {
  const type = resolveType(defs, typeKey)
  if (!type) return { nodes: [], edges: [] }
  const key = String(type.key ?? typeKey)
  let scene: Scene = { nodes: [], edges: [] }
  for (const token of ((type.structures as unknown[]) ?? [])) {
    const structure = resolveStructure(defs, token)
    if (!structure) continue
    const structureKey = String(structure.key ?? '')
    if (!structureKey) continue
    const expanded = expandStructure(defs, structureKey)
    scene = mergeModelScene(scene, {
      nodes: expanded.nodes,
      edges: [
        { id: `model:applies:${key}:${structureKey}`, source: typeNodeId(key), target: `structure:${structureKey}`, label: copy.appliesIn },
        ...expanded.edges,
      ],
    })
  }
  return scene
}
