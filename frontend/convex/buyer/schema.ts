import { defineTable } from 'convex/server';
import { v } from 'convex/values';
const nullableString = v.union(v.string(), v.null());
const payload = v.any(); // Payload writes/reads validate against the frozen runtime contract registry.
export const buyerTables = {
  buyerRequests: defineTable({ ownerId: v.string(), version: v.number(), draftVersion: v.number(), draft: payload, activeRunId: nullableString, createdAt: v.number(), updatedAt: v.number() }).index('by_owner', ['ownerId','updatedAt']),
  buyerRequestVersions: defineTable({ requestId: v.string(), version: v.number(), ownerId: v.string(), data: payload }).index('by_request_version',['requestId','version']),
  buyerRuns: defineTable({ requestId: v.string(), version: v.number(), ownerId: v.string(), stage: v.string(), purchaseStage: v.string(), workflowId: nullableString, config: payload, startedAt: v.number(), updatedAt: v.number(), deadlineAt: v.number(), sequence: v.number(), partial: v.boolean(), error: payload, refillCount: v.number(), providerCalls: v.number(), toolCalls: v.number() }).index('by_request',['requestId']).index('by_owner_started',['ownerId','startedAt']),
  buyerJobs: defineTable({ runId: nullableString, requestId: v.string(), version: v.number(), phase: v.string(), role: v.string(), merchantId: nullableString, candidateId: nullableString, sellerJobId: nullableString, state: v.string(), input: payload, inputDigest: v.string(), provider: v.string(), providerRunId: nullableString, outputDigest: nullableString, output: payload, deadlineAt: v.number(), createdAt: v.number(), completedAt: v.union(v.number(), v.null()) }).index('by_run_phase',['runId','phase']).index('by_run',['runId']).index('by_request',['requestId']),
  buyerOffers: defineTable({ runId: v.string(), candidateId: v.string(), merchantId: v.string(), effective: v.boolean(), stagedRoundId: nullableString, data: payload, card: payload, snapshot: payload }).index('by_run_effective',['runId','effective']).index('by_run_candidate',['runId','candidateId']),
  buyerEvents: defineTable({ runId: v.string(), sequence: v.number(), data: payload }).index('by_run_sequence',['runId','sequence']),
  buyerRounds: defineTable({ runId: v.string(), data: payload }).index('by_run',['runId']),
  buyerSubmissions: defineTable({ roundId: v.string(), candidateId: v.string(), digest: v.string(), offerId: nullableString, decision: v.string() }).index('by_round_candidate',['roundId','candidateId']),
  buyerResearch: defineTable({ runId: v.string(), variantId: v.string(), digest: v.string(), state: v.string(), providerRunId: nullableString, providerBuild: nullableString, input: payload, deadlineAt: v.number(), createdAt: v.number() }).index('by_run',['runId']).index('by_digest',['digest']),
  buyerEvidence: defineTable({ variantId: v.string(), digest: v.string(), runId: v.string(), data: payload, retrievedAt: v.number() }).index('by_digest_time',['digest','retrievedAt']).index('by_run',['runId']),
  buyerQuotes: defineTable({ requestId: v.string(), ownerId: v.string(), runId: v.string(), data: payload, products: payload, snapshot: payload, state: v.string() }).index('by_request',['requestId']),
  buyerApprovals: defineTable({ requestId: v.string(), quoteId: v.string(), ownerId: v.string(), quoteHash: v.string(), executionId: v.string(), createdAt: v.number() }).index('by_quote',['quoteId']),
  buyerExecutions: defineTable({ requestId: v.string(), ownerId: v.string(), quoteId: v.string(), state: v.string(), mode: v.string(), scenario: v.string(), data: payload, attemptCount: v.number(), createdAt: v.number(), updatedAt: v.number() }).index('by_request',['requestId']),
  buyerOrders: defineTable({ requestId: v.string(), ownerId: v.string(), executionId: v.string(), quote: payload, products: payload, createdAt: v.number() }).index('by_execution',['executionId']).index('by_owner',['ownerId','createdAt']),
  buyerCommands: defineTable({ ownerId: v.string(), operation: v.string(), clientKey: v.string(), digest: v.string(), result: payload, createdAt: v.number() }).index('by_key',['ownerId','operation','clientKey']),
  buyerBookmarks: defineTable({ ownerId: v.string(), offerId: v.string(), card: payload, createdAt: v.number() }).index('by_owner',['ownerId']).index('by_owner_offer',['ownerId','offerId']),
  buyerSettings: defineTable({ key: v.string(), value: payload }).index('by_key',['key']),
};
