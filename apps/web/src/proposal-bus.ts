export type OpenProposal = {
  id: string
  operation?: string
  rollback?: { targetSeq: number }
}

type Listener = (proposal: OpenProposal) => void

const listeners = new Set<Listener>()

export function publishProposal(id: string, operation?: string, rollback?: { targetSeq: number }) {
  if (!id) return
  for (const listen of listeners) listen({ id, operation, rollback })
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
