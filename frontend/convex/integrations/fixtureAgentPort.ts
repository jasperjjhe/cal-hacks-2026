import type { Id } from '../lib/sellerContracts.ts'
import {
  assertAgentJobScope,
  providerError,
  type AgentJob,
  type AgentJobResult,
  type AgentPort,
} from './agentProvider.ts'

export type FixtureOutcome =
  | { status: 'pending'; providerRunId: string }
  | { status: 'completed'; providerRunId: string; output: unknown; model?: string | null; elapsedMs?: number }
  | { status: 'failed'; providerRunId?: string | null; message?: string; retryable?: boolean }

export class FixtureAgentPort implements AgentPort {
  private readonly outcomes: Map<Id, FixtureOutcome | FixtureOutcome[]>
  private readonly attempts = new Map<Id, number>()
  private readonly cancelled = new Set<Id>()

  constructor(outcomes: ReadonlyMap<Id, FixtureOutcome | FixtureOutcome[]> = new Map()) {
    this.outcomes = new Map(outcomes)
  }

  async start(job: AgentJob): Promise<AgentJobResult<unknown>> {
    assertAgentJobScope(job, 'fixture')
    if (this.cancelled.has(job.jobId)) {
      return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_REJECTED', 'fixture job was cancelled', false) }
    }
    const outcome = this.nextOutcome(job.jobId) ?? {
      status: 'failed' as const,
      providerRunId: null,
      message: 'fixture outcome was not registered',
      retryable: false,
    }
    return this.toResult(outcome)
  }

  async poll(jobId: Id): Promise<AgentJobResult<unknown>> {
    if (this.cancelled.has(jobId)) {
      return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_REJECTED', 'fixture job was cancelled', false) }
    }
    const outcome = this.nextOutcome(jobId)
    if (!outcome) return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_PROTOCOL', 'fixture outcome was not registered', false) }
    return this.toResult(outcome)
  }

  async cancel(jobId: Id): Promise<void> {
    this.cancelled.add(jobId)
  }

  private nextOutcome(jobId: Id): FixtureOutcome | null {
    const registered = this.outcomes.get(jobId)
    if (!registered) return null
    if (!Array.isArray(registered)) return registered
    const attempt = this.attempts.get(jobId) ?? 0
    this.attempts.set(jobId, attempt + 1)
    return registered[Math.min(attempt, registered.length - 1)] ?? null
  }

  private toResult(outcome: FixtureOutcome): AgentJobResult<unknown> {
    if (outcome.status === 'pending') return { status: 'pending', providerRunId: outcome.providerRunId }
    if (outcome.status === 'completed') {
      return {
        status: 'completed',
        output: outcome.output,
        providerRunId: outcome.providerRunId,
        model: outcome.model ?? 'fixture-seller-v1',
        elapsedMs: outcome.elapsedMs ?? 0,
      }
    }
    return {
      status: 'failed',
      providerRunId: outcome.providerRunId ?? null,
      error: providerError('PROVIDER_REJECTED', outcome.message ?? 'fixture provider failed', outcome.retryable ?? false),
    }
  }
}
