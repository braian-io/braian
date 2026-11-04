import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Shell } from '../shell'
import { parseUrlState, type UrlState } from '../url-state'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): UrlState => parseUrlState(search),
  component: Home,
})

function Home() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <Shell />
    </QueryClientProvider>
  )
}
