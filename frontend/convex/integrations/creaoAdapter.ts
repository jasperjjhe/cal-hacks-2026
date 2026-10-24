import { createHttpAgentPort, type HttpAgentPortConfig, type HttpAgentPortDependencies } from './httpAgentPort.ts'
import type { AgentPort } from './agentProvider.ts'

export type CreaoAgentConfig = Omit<HttpAgentPortConfig, 'provider'> & {
  provider: 'creao'
}

/**
 * CREAO is intentionally an asynchronous HTTP adapter. Project/agent IDs and
 * the exact run/callback endpoints are deployment configuration, not source
 * defaults. Accepted runs remain pending until poll/reconciliation returns a
 * schema-validated output.
 */
export function createCreaoAgentPort(
  config: CreaoAgentConfig,
  dependencies: HttpAgentPortDependencies,
): AgentPort {
  return createHttpAgentPort(config, dependencies)
}
