import { assertNoPrivateSellerFields } from '../lib/sellerContracts.ts'
import {
  assertAgentJobScope,
  providerError,
  type AgentJob,
  type AgentJobResult,
  type AgentPort,
  type AgentProvider,
  type ProviderApiError,
} from './agentProvider.ts'

export interface HttpAgentPortConfig {
  provider: Exclude<AgentProvider, 'fixture'>
  startUrl: string
  pollUrlTemplate: string
  reconcileUrlTemplate?: string
  cancelUrlTemplate: string
  pollMethod?: 'POST' | 'GET'
  reconcileMethod?: 'POST' | 'GET'
  /**
   * Hosted Agentverse REST routes do not need to expose a bearer header to
   * the agent code. When enabled, the server-side token is copied into the
   * POST envelope under `providerAuthToken`; it is never logged or persisted.
   */
  sendTokenInBody?: boolean
  allowedHosts: string[]
  requestTimeoutMs: number
  providerConfigRevision: string
}

export interface HttpAgentPortDependencies {
  fetchImpl?: typeof fetch
  getToken: () => Promise<string | undefined>
  resolveInput: (job: AgentJob) => Promise<unknown>
  resolveProviderRunId: (jobId: string) => Promise<string | null>
}

function validateConfig(config: HttpAgentPortConfig) {
  if (!config.providerConfigRevision || config.providerConfigRevision.length > 128) {
    throw new Error('provider configuration revision is required')
  }
  if (!Number.isSafeInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 1_000 || config.requestTimeoutMs > 30_000) {
    throw new Error('provider request timeout must be between one and thirty seconds')
  }
  for (const [name, template] of Object.entries({
    startUrl: config.startUrl,
    pollUrlTemplate: config.pollUrlTemplate,
    reconcileUrlTemplate: config.reconcileUrlTemplate,
    cancelUrlTemplate: config.cancelUrlTemplate,
  })) {
    if (!template) continue
    const url = new URL(template.replace('{providerRunId}', 'run-placeholder').replace('{jobId}', 'job-placeholder'))
    validateProviderUrl(url, config.allowedHosts, name)
  }
}

function validateProviderUrl(url: URL, allowedHosts: string[], field: string): URL {
  if (url.protocol !== 'https:') throw new Error(`${field} must use HTTPS`)
  if (url.username || url.password || url.port) throw new Error(`${field} must not include credentials or a non-default port`)
  if (!allowedHosts.includes(url.hostname)) throw new Error(`${field} host is not in the provider allowlist`)
  return url
}

function safeMessage(status: number): string {
  if (status === 401 || status === 403) return 'provider authorization was rejected'
  if (status === 408 || status === 429 || status >= 500) return 'provider temporarily unavailable'
  return 'provider rejected the seller job'
}

function classifyNetworkError(error: unknown): ProviderApiError {
  const message = error instanceof Error ? error.message : String(error)
  if (/timeout|aborted/i.test(message)) return providerError('PROVIDER_TIMEOUT', 'provider request timed out', true)
  return providerError('PROVIDER_NETWORK', 'provider request failed before a response was received', true)
}

function classifyRequestError(error: unknown): ProviderApiError {
  const message = error instanceof Error ? error.message : String(error)
  if (/provider redirect|must use https|host is not in the provider allowlist|must not include credentials|invalid url/i.test(message)) {
    return providerError('PROVIDER_PROTOCOL', 'provider returned an invalid redirect or request URL', false)
  }
  return classifyNetworkError(error)
}

function providerRunId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  return typeof record.providerRunId === 'string' && record.providerRunId.length > 0 && record.providerRunId.length <= 256 ? record.providerRunId : null
}

function resultFromResponse(value: unknown, statusCode: number, elapsedMs: number): AgentJobResult<unknown> {
  const runId = providerRunId(value)
  if (!runId) return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_PROTOCOL', 'provider response did not include a bounded run ID', false) }
  if (statusCode === 202) return { status: 'pending', providerRunId: runId }
  if (typeof value !== 'object' || value === null) return { status: 'failed', providerRunId: runId, error: providerError('PROVIDER_PROTOCOL', 'provider response was not a JSON object', false) }
  const record = value as Record<string, unknown>
  if (record.status === 'pending' || record.status === 'accepted' || record.status === 'running') return { status: 'pending', providerRunId: runId }
  if (record.status === 'failed' || record.status === 'cancelled') return { status: 'failed', providerRunId: runId, error: providerError('PROVIDER_REJECTED', 'provider reported a failed seller job', false) }
  if (record.status !== 'completed' && record.status !== 'succeeded') return { status: 'failed', providerRunId: runId, error: providerError('PROVIDER_PROTOCOL', 'provider did not report a terminal success state', false) }
  if (!('output' in record)) return { status: 'failed', providerRunId: runId, error: providerError('PROVIDER_PROTOCOL', 'provider completed without an output payload', false) }
  return {
    status: 'completed',
    output: record.output,
    providerRunId: runId,
    model: typeof record.model === 'string' ? record.model.slice(0, 128) : null,
    elapsedMs,
  }
}

export function createHttpAgentPort(
  config: HttpAgentPortConfig,
  dependencies: HttpAgentPortDependencies,
): AgentPort {
  validateConfig(config)
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch

  async function request(
    url: string,
    method: 'POST' | 'GET',
    body: unknown,
    idempotencyKey: string,
  ): Promise<AgentJobResult<unknown>> {
    const token = await dependencies.getToken()
    const startedAt = Date.now()
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (token) headers.authorization = `Bearer ${token}`
    headers['idempotency-key'] = idempotencyKey
    const requestBody = config.sendTokenInBody
      && token
      && method === 'POST'
      && typeof body === 'object'
      && body !== null
      && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>), providerAuthToken: token }
      : body
    try {
      const serializedBody = requestBody === undefined ? undefined : JSON.stringify(requestBody)
      let currentUrl = validateProviderUrl(new URL(url), config.allowedHosts, 'provider request').href
      let response: Response | null = null
      for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
        response = await fetchImpl(currentUrl, {
          method,
          headers,
          body: serializedBody,
          redirect: 'manual',
          signal: AbortSignal.timeout(config.requestTimeoutMs),
        })
        if (![301, 302, 303, 307, 308].includes(response.status)) break
        if (redirectCount === 3) {
          return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_PROTOCOL', 'provider returned too many redirects', false) }
        }
        const location = response.headers.get('location')
        if (!location) {
          return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_PROTOCOL', 'provider redirect omitted a location', false) }
        }
        const nextUrl = validateProviderUrl(new URL(location, currentUrl), config.allowedHosts, 'provider redirect')
        if (nextUrl.hostname !== new URL(url).hostname) {
          return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_PROTOCOL', 'provider redirect changed host', false) }
        }
        currentUrl = nextUrl.href
      }
      if (!response) return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_PROTOCOL', 'provider returned no response', false) }
      let payload: unknown = null
      try {
        payload = await response.json()
      } catch {
        return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_PROTOCOL', 'provider returned non-JSON output', false) }
      }
      if (!response.ok) {
        return { status: 'failed', providerRunId: providerRunId(payload), error: providerError(response.status === 408 || response.status === 429 || response.status >= 500 ? 'PROVIDER_NETWORK' : 'PROVIDER_REJECTED', safeMessage(response.status), response.status === 408 || response.status === 429 || response.status >= 500) }
      }
      return resultFromResponse(payload, response.status, Date.now() - startedAt)
    } catch (error) {
      return { status: 'failed', providerRunId: null, error: classifyRequestError(error) }
    }
  }

  return {
    async start(job: AgentJob) {
      assertAgentJobScope(job, config.provider)
      const input = await dependencies.resolveInput(job)
      assertNoPrivateSellerFields(input)
      return request(config.startUrl, 'POST', {
        jobId: job.jobId,
        runId: job.runId,
        phaseId: job.phaseId,
        role: job.role,
        inputRef: job.inputRef,
        inputDigest: job.inputDigest,
        input,
      }, job.jobId)
    },
    async poll(jobId: string) {
      const providerRunIdValue = await dependencies.resolveProviderRunId(jobId)
      const url = providerRunIdValue
        ? config.pollUrlTemplate.replace('{providerRunId}', encodeURIComponent(providerRunIdValue))
        : config.reconcileUrlTemplate?.replace('{jobId}', encodeURIComponent(jobId))
      if (!url) return { status: 'failed', providerRunId: null, error: providerError('PROVIDER_PROTOCOL', 'provider run ID is not recorded and no reconciliation endpoint is configured', false) }
      const method = providerRunIdValue ? (config.pollMethod ?? 'GET') : (config.reconcileMethod ?? 'GET')
      const body = method === 'POST'
        ? { jobId, ...(providerRunIdValue ? { providerRunId: providerRunIdValue } : {}) }
        : undefined
      return request(url, method, body, jobId)
    },
    async cancel(jobId: string) {
      const providerRunIdValue = await dependencies.resolveProviderRunId(jobId)
      if (!providerRunIdValue) return
      const url = config.cancelUrlTemplate.replace('{providerRunId}', encodeURIComponent(providerRunIdValue))
      await request(url, 'POST', { jobId, providerRunId: providerRunIdValue }, jobId)
    },
  }
}
