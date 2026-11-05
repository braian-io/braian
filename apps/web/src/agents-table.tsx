import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agentStatusLabel, agentStatusTone, listAgentRuns, requestOpenAgent, sortAgentRuns, type AgentRunSummary } from './agent-runs'
import { MetaChip } from './chips'
import { formatTimestamp } from './format'
import { copy } from './i18n'
import { StandardEditableTable, type StandardColumn } from './standard-editable-table'

type AgentTableRow = {
  id: string
  name: string
  status: string
  proposals: string
  updated: string
  run: AgentRunSummary
}

export function AgentsTable() {
  const [filter, setFilter] = useState('')
  const list = useQuery({
    queryKey: ['agent-runs'],
    queryFn: listAgentRuns,
    refetchInterval: 1000,
  })
  const rows: AgentTableRow[] = sortAgentRuns(list.data ?? []).map((run) => ({
    id: run.id,
    name: run.title,
    status: agentStatusLabel(run.status),
    proposals: String(run.proposal_count ?? 0),
    updated: formatTimestamp(run.updated_at),
    run,
  }))
  const columns: Array<StandardColumn<AgentTableRow>> = [
    {
      id: 'name',
      header: copy.agentColumnName,
      type: 'readonly',
      read: (row) => row.name,
      title: (row) => row.name,
    },
    {
      id: 'status',
      header: copy.agentColumnStatus,
      type: 'readonly',
      width: 108,
      read: (row) => row.status,
      display: (row) => <MetaChip tone={agentStatusTone(row.run.status)}>{row.status}</MetaChip>,
    },
    { id: 'proposals', header: copy.agentColumnProposals, type: 'readonly', width: 88, read: (row) => row.proposals },
    { id: 'updated', header: copy.agentColumnUpdated, type: 'readonly', width: 148, read: (row) => row.updated },
  ]
  const error = list.isError ? (list.error instanceof Error ? list.error.message : copy.agentsEmpty) : ''
  return (
    <StandardEditableTable
      testId="agents-table"
      columns={columns}
      rows={rows}
      editable={false}
      loading={list.isPending}
      emptyLabel={copy.agentsEmpty}
      filterValue={filter}
      onFilterChange={setFilter}
      onActivateRow={(row) => requestOpenAgent(row.run)}
      getRowTestId={() => 'agent-table-row'}
      belowBar={error ? <p className="error" role="alert" data-testid="agents-table-error">{error}</p> : null}
    />
  )
}
