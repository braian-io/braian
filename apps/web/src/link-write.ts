import { api, jsonRecord, type Json } from './api'
import { aiMode } from './ai-mode'
import { copy } from './i18n'
import { publishProposal } from './proposal-bus'

export type LinkWrite = {
  type: string
  from_id: string
  to_id: string
  values: Json
}

/**
 * A person saves the link. AI mode, and an agent principal, file a proposal
 * and open Review. The proposal row matches the one the agent tool already stores.
 */
export async function submitLink(body: LinkWrite): Promise<'created' | 'proposed'> {
  if (aiMode()) {
    const created = await api.post('/v1/proposals', {
      body: {
        title: 'Link proposal',
        rows: [{ type_key: body.type, patch: { link: body } }],
      },
    })
    const id = String(jsonRecord(created)?.id ?? '')
    if (!id) throw new Error(copy.linkProposalFailed)
    publishProposal(id)
    return 'proposed'
  }
  const result = await api.post('/v1/links', { body })
  const record = jsonRecord(result)
  const proposalId = String(record?.proposal_id ?? '')
  if (proposalId && record?.needs_approval === true) {
    publishProposal(proposalId)
    return 'proposed'
  }
  return 'created'
}
