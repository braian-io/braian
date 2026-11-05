import { ApiError, api, jsonRecord, type Json } from './api'
import { aiMode } from './ai-mode'
import { copy } from './i18n'
import { publishProposal } from './proposal-bus'
import { errorCodeFromBody, fieldErrorsFromErrorBody, writeErrorMessage, type WriteFieldError } from './write-error'

export type LinkWrite = {
  type: string
  from_id: string
  to_id: string
  values: Json
}

export type CreatedLink = {
  body: LinkWrite
  id: string
  /** Version from the create response. Undo sends it as If-Match. */
  version: number
  /** Peer key or name, used when undo has to say which link was kept. */
  label: string
}

export type LinkWriteFailure = {
  body: LinkWrite
  message: string
  status?: number
  code?: string
  fieldErrors?: WriteFieldError[]
}

export type LinkSubmitResult =
  | { outcome: 'created'; created: CreatedLink[] }
  | { outcome: 'proposed'; created: CreatedLink[]; filed: number }
  | { outcome: 'partial'; created: CreatedLink[]; failed: LinkWriteFailure }

export class LinkWriteError extends Error {
  failure: LinkWriteFailure

  constructor(failure: LinkWriteFailure) {
    super(failure.message)
    this.name = 'LinkWriteError'
    this.failure = failure
  }
}

export function linkFailure(error: unknown, body: LinkWrite): LinkWriteFailure {
  if (error instanceof LinkWriteError) return error.failure
  const message = writeErrorMessage(error) || copy.validation
  if (error instanceof ApiError) {
    const code = errorCodeFromBody(error.body)
    const fieldErrors = fieldErrorsFromErrorBody(error.body)
    return {
      body,
      message,
      status: error.status,
      ...(code ? { code } : {}),
      ...(fieldErrors.length > 0 ? { fieldErrors } : {}),
    }
  }
  return { body, message }
}

export type UndoLinksResult = {
  undone: CreatedLink[]
  kept: CreatedLink[]
  failed: Array<{ link: CreatedLink; message: string }>
}

/**
 * A person saves the link. AI mode, and an agent principal, file a proposal
 * and open Review. The proposal row matches the one the agent tool already stores.
 */
export async function submitLink(body: LinkWrite): Promise<'created' | 'proposed'> {
  const result = await submitLinks([body])
  if (result.outcome === 'partial') throw new LinkWriteError(result.failed)
  return result.outcome === 'proposed' ? 'proposed' : 'created'
}

/**
 * AI mode files every link in one proposal. A person saves each link.
 * A failure stops the rest and reports the links already stored, so a retry
 * does not create those again. An agent principal gets one proposal for the
 * links that are not saved yet, and the message says how many of each.
 */
export async function submitLinks(bodies: LinkWrite[]): Promise<LinkSubmitResult> {
  if (bodies.length === 0) return { outcome: 'created', created: [] }
  if (aiMode()) {
    await fileProposal(bodies)
    return { outcome: 'proposed', created: [], filed: bodies.length }
  }
  const created: CreatedLink[] = []
  for (const body of bodies) {
    let result: unknown
    try {
      result = await api.post('/v1/links', { body })
    } catch (error) {
      return {
        outcome: 'partial',
        created,
        failed: linkFailure(error, body),
      }
    }
    const record = jsonRecord(result)
    const proposalId = String(record?.proposal_id ?? '')
    if (proposalId && record?.needs_approval === true) {
      publishProposal(proposalId)
      const remaining = bodies.slice(created.length + 1)
      if (remaining.length > 0) await fileProposal(remaining)
      const filed = 1 + remaining.length
      return { outcome: 'proposed', created, filed }
    }
    const version = Number(record?.version)
    created.push({
      body,
      id: String(record?.id ?? ''),
      version: Number.isFinite(version) && version > 0 ? version : 0,
      label: '',
    })
  }
  return { outcome: 'created', created }
}

export async function replaceConflictingLink(
  sourceId: string,
  body: LinkWrite,
  preferSource = true,
): Promise<CreatedLink> {
  const id = await conflictingLinkId(sourceId, body, preferSource)
  if (!id) throw new Error(copy.linkReplaceMissing)
  const current = await api.get('/v1/objects/{id}', { params: { path: { id } } })
  const version = Number(jsonRecord(current)?.version)
  if (!(version > 0)) throw new Error(copy.linkReplaceMissing)
  const result = await api.patch('/v1/links/{id}', {
    params: { path: { id }, header: { 'If-Match': version } },
    body: { from_id: body.from_id, to_id: body.to_id, values: body.values },
  })
  const next = Number(jsonRecord(result)?.version)
  return { body, id, version: Number.isFinite(next) && next > 0 ? next : version + 1, label: '' }
}

async function conflictingLinkId(sourceId: string, body: LinkWrite, preferSource: boolean): Promise<string> {
  const peerId = body.from_id === sourceId ? body.to_id : body.from_id
  const first = preferSource ? sourceId : peerId
  const firstPeer = preferSource ? peerId : sourceId
  if (first) {
    const sides = await api.get('/v1/links', { params: { query: { object: first } } }) as Json[]
    const atFirst = differentPeer(sides, body.type, firstPeer)
    if (atFirst) return atFirst
  }
  const second = preferSource ? peerId : sourceId
  const secondPeer = preferSource ? sourceId : peerId
  if (!second) return ''
  const sides = await api.get('/v1/links', { params: { query: { object: second } } }) as Json[]
  return differentPeer(sides, body.type, secondPeer)
}

function differentPeer(sides: Json[], linkType: string, keepPeer: string): string {
  for (const side of sides ?? []) {
    if (String(side.link_type ?? '') !== linkType) continue
    for (const link of ((side.links as Json[] | undefined) ?? [])) {
      const id = String(link.id ?? '')
      const peer = String(link.peer_id ?? '')
      if (id && peer && peer !== keepPeer) return id
    }
  }
  return ''
}

/**
 * Deletes only the links that are still the version we created.
 * A missing link counts as undone. A newer version is kept. One failure
 * does not cancel the others.
 */
export async function undoCreatedLinks(links: CreatedLink[]): Promise<UndoLinksResult> {
  const settled = await Promise.allSettled(links.map((link) => deleteIfUnchanged(link)))
  const undone: CreatedLink[] = []
  const kept: CreatedLink[] = []
  const failed: UndoLinksResult['failed'] = []
  settled.forEach((item, index) => {
    const link = links[index]
    if (!link) return
    if (item.status === 'rejected') {
      failed.push({ link, message: writeErrorMessage(item.reason) || copy.validation })
      return
    }
    if (item.value === 'kept') kept.push(link)
    else undone.push(link)
  })
  return { undone, kept, failed }
}

async function deleteIfUnchanged(link: CreatedLink): Promise<'undone' | 'kept'> {
  try {
    let version = link.version
    if (!(version > 0)) {
      const current = await api.get('/v1/objects/{id}', { params: { path: { id: link.id } } })
      version = Number(jsonRecord(current)?.version)
      if (!(version > 0)) throw new Error(copy.validation)
    }
    await api.delete('/v1/links/{id}', {
      params: { path: { id: link.id }, header: { 'If-Match': version } },
    })
    return 'undone'
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 410)) return 'undone'
    if (error instanceof ApiError && error.status === 409) return 'kept'
    throw error
  }
}

async function fileProposal(bodies: LinkWrite[]) {
  const created = await api.post('/v1/proposals', {
    body: {
      title: 'Link proposal',
      rows: bodies.map((body) => ({ type_key: body.type, patch: { link: body } })),
    },
  })
  const id = String(jsonRecord(created)?.id ?? '')
  if (!id) throw new Error(copy.linkProposalFailed)
  publishProposal(id)
}
