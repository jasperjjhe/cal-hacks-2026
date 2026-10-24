import { createHttpAgentPort, type HttpAgentPortConfig, type HttpAgentPortDependencies } from './httpAgentPort.ts'
import type { AgentPort } from './agentProvider.ts'

export type FetchAgentConfig = Omit<HttpAgentPortConfig, 'provider'> & {
  provider: 'fetch'
}

/**
 * Fetch.ai remains endpoint/configuration driven until the team supplies the
 * real agent address, transport and authentication. No endpoint or agent ID
 * is invented here, and the adapter cannot be constructed without an HTTPS
 * allowlist.
 */
export function createFetchAgentPort(
  config: FetchAgentConfig,
  dependencies: HttpAgentPortDependencies,
): AgentPort {
  return createHttpAgentPort(config, dependencies)
}
