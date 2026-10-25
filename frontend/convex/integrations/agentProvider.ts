import type { Id, Ms } from '../lib/sellerContracts.ts'

export type AgentRole = 'seller_initial' | 'seller_response' | 'seller_final' | 'seller_advocacy' | 'seller_reply'
export type AgentProvider = 'fixture' | 'fetch' | 'creao'

export interface AgentJob {
  jobId: Id
  requestId: Id
  requestVersion: number
  runId: Id
  phaseId: Id
  role: AgentRole
  merchantId: Id | null
  deadlineAt: Ms
  provider: AgentProvider
  inputDigest: string
  inputRef: Id
}

export interface ProviderApiError {
  code: 'PROVIDER_CONFIGURATION' | 'PROVIDER_NETWORK' | 'PROVIDER_PROTOCOL' | 'PROVIDER_TIMEOUT' | 'PROVIDER_REJECTED'
  message: string
  retryable: boolean
}

export type AgentJobResult<T> =
  | { status: 'pending'; providerRunId: string }
  | { status: 'completed'; output: T; providerRunId: string; model: string | null; elapsedMs: number }
  | { status: 'failed'; error: ProviderApiError; providerRunId: string | null }

export interface AgentPort {
  start(job: AgentJob): Promise<AgentJobResult<unknown>>
  poll(jobId: Id): Promise<AgentJobResult<unknown>>
  cancel(jobId: Id): Promise<void>
}

export function providerError(
  code: ProviderApiError['code'],
  message: string,
  retryable: boolean,
): ProviderApiError {
  return { code, message, retryable }
}

export function assertAgentJobScope(job: AgentJob, expectedProvider: AgentProvider) {
  if (job.provider !== expectedProvider) {
    throw new Error(`provider scope mismatch: expected ${expectedProvider}`)
  }
  if (!job.jobId || !job.runId || !job.phaseId || !job.inputRef || !job.inputDigest) {
    throw new Error('agent job is missing a server-owned scope field')
  }
  if (!Number.isSafeInteger(job.deadlineAt) || job.deadlineAt <= 0) {
    throw new Error('agent job deadline is invalid')
  }
}
