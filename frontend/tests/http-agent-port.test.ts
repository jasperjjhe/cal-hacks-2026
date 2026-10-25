import { describe, expect, test } from 'vitest'
import { createHttpAgentPort } from '../convex/integrations/httpAgentPort.ts'

function port(reply: Record<string, unknown>) {
  const fetchImpl = (async () => new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
  return createHttpAgentPort({
    provider: 'fetch',
    startUrl: 'https://gateway.example/seller/jobs',
    pollUrlTemplate: 'https://gateway.example/seller/jobs/poll',
    cancelUrlTemplate: 'https://gateway.example/seller/jobs/cancel',
    pollMethod: 'POST',
    sendTokenInBody: true,
    allowedHosts: ['gateway.example'],
    requestTimeoutMs: 5000,
    providerConfigRevision: 'test',
  }, {
    fetchImpl,
    getToken: async () => 'token',
    resolveInput: async () => ({}),
    resolveProviderRunId: async () => 'fetch-seller:job_1',
  })
}

describe('HTTP agent port failure mapping', () => {
  test('transient gateway failures keep their code and stay retryable', async () => {
    const timeout = await port({ status: 'failed', providerRunId: 'fetch-seller:job_1', errorCode: 'PROVIDER_TIMEOUT', errorRetryable: true }).poll('job_1')
    expect(timeout).toMatchObject({ status: 'failed', error: { code: 'PROVIDER_TIMEOUT', retryable: true } })
    const unavailable = await port({ status: 'failed', providerRunId: 'fetch-seller:job_1', errorCode: 'PROVIDER_UNAVAILABLE', errorRetryable: true }).poll('job_1')
    expect(unavailable).toMatchObject({ status: 'failed', error: { code: 'PROVIDER_NETWORK', retryable: true } })
  })

  test('agent decisions and unknown codes stay non-retryable rejections', async () => {
    const invalid = await port({ status: 'failed', providerRunId: 'fetch-seller:job_1', errorCode: 'INVALID_INPUT', errorRetryable: false }).poll('job_1')
    expect(invalid).toMatchObject({ status: 'failed', error: { code: 'PROVIDER_REJECTED', retryable: false } })
    const cancelled = await port({ status: 'cancelled', providerRunId: 'fetch-seller:job_1', errorRetryable: true }).poll('job_1')
    expect(cancelled).toMatchObject({ status: 'failed', error: { code: 'PROVIDER_REJECTED', retryable: false } })
  })

  test('provider error text is never copied into the recorded message', async () => {
    const result = await port({ status: 'failed', providerRunId: 'fetch-seller:job_1', errorCode: 'secret detail', errorRetryable: false }).poll('job_1')
    expect(JSON.stringify(result)).not.toContain('secret detail')
  })
})
