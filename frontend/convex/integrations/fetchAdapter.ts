import { createHttpAgentPort, type HttpAgentPortConfig, type HttpAgentPortDependencies } from './httpAgentPort.ts'
import type { AgentPort } from './agentProvider.ts'

export type FetchAgentConfig = Omit<HttpAgentPortConfig, 'provider'> & {
  provider: 'fetch'
}

/**
 * Fetch.ai is the seller-side provider. The adapter deliberately contains no
 * agent address or credential: the Convex deployment supplies exact HTTPS
 * routes and an allowlisted host at runtime. The checked-in Agentverse
 * implementation lives under `agents/fetch-seller/` and speaks this port's
 * bounded start/poll/reconcile/cancel contract.
 */
export function createFetchAgentPort(
  config: FetchAgentConfig,
  dependencies: HttpAgentPortDependencies,
): AgentPort {
  return createHttpAgentPort(config, dependencies)
}
