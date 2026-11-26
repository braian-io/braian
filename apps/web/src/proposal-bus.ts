export type OpenProposal = {
  id: string
  operation?: string
  rollback?: { targetSeq: number }
  /** Catalog key the proposal was filed in. Master stays unscoped. */
  catalog?: string
}

type Listener = (proposal: OpenProposal) => void

const listeners = new Set<Listener>()

export function publishProposal(
  id: string,
  operation?: string,
  rollback?: { targetSeq: number },
  catalog?: string,
) {
  if (!id) return
  for (const listen of listeners) listen({ id, operation, rollback, catalog })
}

export function onProposal(listen: Listener) {
  listeners.add(listen)
  return () => {
    listeners.delete(listen)
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as Window & { __braianPublishProposal?: typeof publishProposal }).__braianPublishProposal = publishProposal
}
