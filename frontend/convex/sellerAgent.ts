import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import type { FunctionReference } from 'convex/server'

import {
  providerError,
  type AgentJob,
  type AgentPort,
  type AgentProvider,
  type AgentJobResult,
} from './integrations/agentProvider.ts'
import { createCreaoAgentPort } from './integrations/creaoAdapter.ts'
import { createFetchAgentPort } from './integrations/fetchAdapter.ts'
import type { HttpAgentPortConfig, HttpAgentPortDependencies } from './integrations/httpAgentPort.ts'

declare const process: { env: Record<string, string | undefined> }

const POLL_DELAY_MS = 2_000
const RETRY_DELAY_MS = 1_000

type LiveProvider = Exclude<AgentProvider, 'fixture'>

type SellerDispatchState = 'missing' | 'not_claimed' | 'failed' | 'ambiguous' | 'pending' | 'completed' | 'rejected'

interface SellerDispatchResult {
  pending: boolean
  state: SellerDispatchState
  providerRunId?: string
  result?: unknown
}

interface SellerCancelResult {
  cancelled: boolean
  replayed?: boolean
  state?: 'missing'
}

type ProviderValidationArgs = {
  jobId: string
  brief: unknown
  decision: unknown
  mode: 'live'
  providerRunId: string
  providerModel: string | null
  providerElapsedMs: number
}

type ProviderValidationResult = { ok: boolean; [key: string]: unknown }

// This explicit local type keeps the generated API from recursing through the
// provider action -> validation mutation -> generated API import cycle.
const validateProviderProposal = internal.sellerInternal.validateAndStoreProposal as unknown as FunctionReference<'mutation', 'internal', ProviderValidationArgs, ProviderValidationResult>

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing seller provider configuration: ${name}`)
  return value
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

function allowedHosts(name: string): string[] {
  const value = requiredEnv(name)
  const hosts = value.split(',').map((host) => host.trim()).filter(Boolean)
  if (hosts.length === 0 || hosts.length > 8 || hosts.some((host) => host.length > 253 || host.includes('/') || host.includes('*'))) {
    throw new Error(`seller provider host allowlist is invalid: ${name}`)
  }
  return [...new Set(hosts)]
}

function timeoutMs(name: string): number {
  const value = Number(requiredEnv(name))
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 30_000) {
    throw new Error(`seller provider timeout is invalid: ${name}`)
  }
  return value
}

function livePortConfig(provider: LiveProvider): HttpAgentPortConfig {
  const prefix = provider === 'fetch' ? 'FETCH_SELLER' : 'CREAO_SELLER'
  return {
    provider,
    startUrl: requiredEnv(`${prefix}_START_URL`),
    pollUrlTemplate: requiredEnv(`${prefix}_POLL_URL_TEMPLATE`),
    reconcileUrlTemplate: optionalEnv(`${prefix}_RECONCILE_URL_TEMPLATE`),
    cancelUrlTemplate: requiredEnv(`${prefix}_CANCEL_URL_TEMPLATE`),
    // The Fetch implementation uses fixed Agentverse REST routes with the
    // application job ID in a typed POST body. CREAO keeps the legacy GET
    // polling default until its endpoint contract is configured.
    pollMethod: provider === 'fetch' ? 'POST' : undefined,
    reconcileMethod: provider === 'fetch' ? 'POST' : undefined,
    sendTokenInBody: provider === 'fetch',
    allowedHosts: allowedHosts(`${prefix}_ALLOWED_HOSTS`),
    requestTimeoutMs: timeoutMs(`${prefix}_REQUEST_TIMEOUT_MS`),
    providerConfigRevision: requiredEnv(`${prefix}_CONFIG_REVISION`),
  }
}

function providerToken(provider: LiveProvider): string | undefined {
  return optionalEnv(provider === 'fetch' ? 'FETCH_SELLER_AGENT_TOKEN' : 'CREAO_SELLER_API_TOKEN')
}

function createPort(
  provider: AgentProvider,
  input: unknown,
  providerRunId: string | null,
): AgentPort {
  if (provider === 'fixture') throw new Error('fixture provider is available only to deterministic tests')
  const config = livePortConfig(provider)
  const dependencies: HttpAgentPortDependencies = {
    getToken: async () => providerToken(provider),
    resolveInput: async () => input,
    resolveProviderRunId: async () => providerRunId,
  }
  return provider === 'fetch'
    ? createFetchAgentPort({ ...config, provider: 'fetch' }, dependencies)
    : createCreaoAgentPort({ ...config, provider: 'creao' }, dependencies)
}

function asAgentJob(job: {
  jobId: string
  requestId: string
  requestVersion: number
  runId: string
  phaseId: string
  role: 'seller_initial' | 'seller_response' | 'seller_final'
  merchantId: string
  deadlineAt: number
  provider: AgentProvider
  inputDigest: string
  inputRef: string
}): AgentJob {
  return job
}

function thrownProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/missing seller provider configuration|seller provider .*invalid|fixture provider/i.test(message)) {
    return providerError('PROVIDER_CONFIGURATION', 'seller provider is not configured', false)
  }
  return providerError('PROVIDER_NETWORK', 'seller provider request failed before a response was received', true)
}

async function runProvider(
  port: AgentPort,
  job: AgentJob,
  mode: 'start' | 'poll' | 'reconcile',
): Promise<AgentJobResult<unknown>> {
  try {
    if (mode === 'start') return await port.start(job)
    return await port.poll(job.jobId)
  } catch (error) {
    return { status: 'failed', providerRunId: null, error: thrownProviderError(error) }
  }
}

export const dispatch = internalAction({
  args: {
    jobId: v.string(),
    poll: v.optional(v.boolean()),
    reconcile: v.optional(v.boolean()),
  },
  handler: async (ctx, args: { jobId: string; poll?: boolean; reconcile?: boolean }): Promise<SellerDispatchResult> => {
    const providerJob = await ctx.runQuery(internal.sellerInternal.getProviderJob, { jobId: args.jobId })
    if (!providerJob) return { pending: false, state: 'missing' as const }
    const mode = args.reconcile ? 'reconcile' : args.poll ? 'poll' : 'start'
    const claimed = await ctx.runMutation(internal.sellerInternal.claimSellerJob, {
      jobId: args.jobId,
      poll: mode === 'poll',
      reconcile: mode === 'reconcile',
    })
    if (!claimed) return { pending: false, state: 'not_claimed' as const }
    const job = asAgentJob(claimed)
    if (!providerJob.input || !providerJob.brief) {
      const result = await ctx.runMutation(internal.sellerInternal.recordProviderResult, {
        jobId: args.jobId,
        status: 'failed',
        providerRunId: null,
        providerModel: null,
        providerElapsedMs: null,
        errorCode: 'PROVIDER_CONFIGURATION',
        errorRetryable: false,
      })
      return { pending: result.pending, state: 'failed' as const }
    }
    let port: AgentPort | null = null
    let portError: unknown = null
    try {
      port = createPort(job.provider, providerJob.input, claimed.providerRunId)
    } catch (error) {
      portError = error
    }
    const providerResult = portError
      ? { status: 'failed' as const, providerRunId: null, error: thrownProviderError(portError) }
      : await runProvider(port as AgentPort, job, mode)

    if (providerResult.status === 'pending') {
      const stored = await ctx.runMutation(internal.sellerInternal.recordProviderResult, {
        jobId: args.jobId,
        status: 'pending',
        providerRunId: providerResult.providerRunId,
        providerModel: null,
        providerElapsedMs: null,
        errorCode: null,
        errorRetryable: null,
      })
      if (stored.pending) {
        await ctx.scheduler.runAfter(POLL_DELAY_MS, internal.sellerAgent.dispatch, { jobId: args.jobId, poll: true })
      }
      return { pending: stored.pending, state: 'pending' as const, providerRunId: providerResult.providerRunId }
    }

    if (providerResult.status === 'failed') {
      const stored = await ctx.runMutation(internal.sellerInternal.recordProviderResult, {
        jobId: args.jobId,
        status: 'failed',
        providerRunId: providerResult.providerRunId,
        providerModel: null,
        providerElapsedMs: null,
        errorCode: providerResult.error.code,
        errorRetryable: providerResult.error.retryable,
      })
      if (stored.retry) {
        await ctx.scheduler.runAfter(RETRY_DELAY_MS, internal.sellerAgent.dispatch, {
          jobId: args.jobId,
          poll: stored.poll,
        })
      }
      return { pending: stored.pending, state: stored.ambiguous ? 'ambiguous' as const : 'failed' as const }
    }

    try {
      const completed = await ctx.runMutation(validateProviderProposal, {
        jobId: args.jobId,
        brief: providerJob.brief,
        decision: providerResult.output,
        mode: 'live',
        providerRunId: providerResult.providerRunId,
        providerModel: providerResult.model,
        providerElapsedMs: providerResult.elapsedMs,
      })
      return { pending: false, state: completed.ok ? 'completed' as const : 'rejected' as const, result: completed }
    } catch {
      const stored = await ctx.runMutation(internal.sellerInternal.recordProviderResult, {
        jobId: args.jobId,
        status: 'failed',
        providerRunId: providerResult.providerRunId,
        providerModel: providerResult.model,
        providerElapsedMs: providerResult.elapsedMs,
        errorCode: 'PROVIDER_PROTOCOL',
        errorRetryable: false,
      })
      return { pending: stored.pending, state: 'failed' as const }
    }
  },
})

export const reconcile = internalAction({
  args: { jobId: v.string() },
  handler: async (ctx, args: { jobId: string }): Promise<SellerDispatchResult> => {
    return ctx.runAction(internal.sellerAgent.dispatch, { jobId: args.jobId, reconcile: true })
  },
})

export const cancel = internalAction({
  args: { jobId: v.string() },
  handler: async (ctx, args: { jobId: string }): Promise<SellerCancelResult> => {
    const providerJob = await ctx.runQuery(internal.sellerInternal.getProviderJob, { jobId: args.jobId })
    if (!providerJob) return { cancelled: false, state: 'missing' as const }
    if (providerJob.job.providerRunId) {
      try {
        const port = createPort(providerJob.job.provider, providerJob.input, providerJob.job.providerRunId)
        await port.cancel(args.jobId)
      } catch {
        // The terminal cancelled state remains authoritative even if best-effort
        // provider cancellation is unavailable or the provider is unreachable.
      }
    }
    return ctx.runMutation(internal.sellerInternal.markSellerJobCancelled, { jobId: args.jobId })
  },
})
