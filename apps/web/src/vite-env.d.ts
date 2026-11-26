/// <reference types="vite/client" />

declare const __BRAIAN_BUILD__: string

interface Window {
  __braianPublishProposal?: (id: string, operation?: string, rollback?: { targetSeq: number }) => void
}
