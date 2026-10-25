import type { ApiError, Contract } from '../../contracts/index.ts'

export type AgentRole = 'intake' | 'seller_initial' | 'moderator' | 'seller_response' | 'seller_final' | 'evidence_summary'

export interface AgentJob {
  jobId: string
  request: Contract<'Ref'>
  runId: string | null
  role: AgentRole
  merchantId: string | null
  phaseId: string
  deadlineAt: number
  provider: 'fetch' | 'creao'
  inputDigest: string
  inputRef: string
}

export type AgentJobResult =
  | { status: 'pending'; providerRunId: string }
  | { status: 'completed'; output: unknown; providerRunId: string; model: string | null; elapsedMs: number }
  | { status: 'failed'; error: ApiError; providerRunId: string | null }

// start may be ambiguous on timeout. The durable coordinator must record the
// attempt and reconcile/poll it, never automatically switch provider or restart.
export interface AgentPort {
  start(job: AgentJob): Promise<AgentJobResult>
  poll(jobId: string): Promise<AgentJobResult>
  cancel(jobId: string): Promise<void>
}

export const buyerAgentProviders = {
  intake: 'creao', moderator: 'creao', evidence_summary: 'creao',
} as const

// Live transport must be implemented against a tested CREAO project/run API.
// Keep "fixture" separate from AgentProvider so a test result cannot imply a
// successful CREAO invocation. No guessed URLs, credentials or model defaults.
export interface FixtureAgentPort extends AgentPort {
  readonly mode: 'fixture'
}
