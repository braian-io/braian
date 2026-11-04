import type { QueryClient } from '@tanstack/react-query'
import type { Json } from './api'

type WrittenObject = { version: number; object: Json }

const written = new Map<string, WrittenObject>()
let searchWaitSeq = 0

function versionOf(value: Json | undefined): number {
  const version = Number(value?.version)
  return Number.isFinite(version) ? version : 0
}

export function noteWriteSeq(seq: unknown): void {
  const value = Number(seq)
  if (Number.isFinite(value) && value > searchWaitSeq) searchWaitSeq = value
}

export function currentSearchWaitSeq(): number {
  return searchWaitSeq
}

export function resetObjectWriteState(): void {
  written.clear()
  searchWaitSeq = 0
}

export function recordObjectWrite(response: Json): void {
  const id = String(response.id ?? '')
  if (!id) return
  const version = versionOf(response)
  const known = written.get(id)
  if (!known || version >= known.version) written.set(id, { version, object: response })
  noteWriteSeq(response.seq)
}

export function reconcileObjectWrite(id: string, incoming: Json): Json {
  const known = written.get(id)
  if (!known) return incoming
  if (versionOf(incoming) >= known.version) {
    written.delete(id)
    return incoming
  }
  return known.object
}

export async function applyObjectWrite(queryClient: QueryClient, response: Json): Promise<void> {
  const id = String(response.id ?? '')
  if (!id) return
  recordObjectWrite(response)
  await queryClient.cancelQueries({ queryKey: ['object', id] })
  queryClient.setQueryData(['object', id], response)
  await queryClient.cancelQueries({ queryKey: ['objects'] })
  await queryClient.cancelQueries({ queryKey: ['path-values'] })
  void queryClient.invalidateQueries({ queryKey: ['objects'] })
  void queryClient.invalidateQueries({ queryKey: ['path-values'] })
  void queryClient.invalidateQueries({ queryKey: ['object-ref', id] })
  void queryClient.invalidateQueries({ queryKey: ['history', id] })
}
