import { api, jsonRecord, type Json } from './api'
import { aiMode } from './ai-mode'
import { copy } from './i18n'
import { publishProposal } from './proposal-bus'
import { writeErrorMessage } from './write-error'

export type LinkWrite = {
  type: string
  from_id: string
  to_id: string
  values: Json
}

export type CreatedLink = {
  body: LinkWrite
  id: string
}

export type LinkSubmitResult =
  | { outcome: 'created'; created: CreatedLink[] }
  | { outcome: 'proposed'; created: CreatedLink[] }
  | { outcome: 'partial'; created: CreatedLink[]; failed: { body: LinkWrite; message: string } }

/**
 * A person saves the link. AI mode, and an agent principal, file a proposal
 * and open Review. The proposal row matches the one the agent tool already stores.
 */
export async function submitLink(body: LinkWrite): Promise<'created' | 'proposed'> {
  const result = await submitLinks([body])
  if (result.outcome === 'partial') throw new Error(result.failed.message)
  return result.outcome === 'proposed' ? 'proposed' : 'created'
}

/**
 * AI mode files every link in one proposal. A person saves each link.
 * A failure stops the rest and reports the links already stored, so a retry
 * does not create those again. An agent principal gets one proposal for the
 * whole set instead of a proposal per link.
 */
export async function submitLinks(bodies: LinkWrite[]): Promise<LinkSubmitResult> {
  if (bodies.length === 0) return { outcome: 'created', created: [] }
  if (aiMode()) return proposeAll(bodies)
  const created: CreatedLink[] = []
  for (const body of bodies) {
    let result: unknown
    try {
      result = await api.post('/v1/links', { body })
    } catch (error) {
      return {
        outcome: 'partial',
        created,
        failed: { body, message: writeErrorMessage(error) || copy.validation },
      }
    }
    const record = jsonRecord(result)
    const proposalId = String(record?.proposal_id ?? '')
    if (proposalId && record?.needs_approval === true) {
      if (bodies.length === 1 && created.length === 0) {
        publishProposal(proposalId)
        return { outcome: 'proposed', created }
      }
      return proposeAll(bodies)
    }
    created.push({ body, id: String(record?.id ?? '') })
  }
  return { outcome: 'created', created }
}

async function proposeAll(bodies: LinkWrite[]): Promise<LinkSubmitResult> {
  const created = await api.post('/v1/proposals', {
    body: {
      title: 'Link proposal',
      rows: bodies.map((body) => ({ type_key: body.type, patch: { link: body } })),
    },
  })
  const id = String(jsonRecord(created)?.id ?? '')
  if (!id) throw new Error(copy.linkProposalFailed)
  publishProposal(id)
  return { outcome: 'proposed', created: [] }
}
