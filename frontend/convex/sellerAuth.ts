import type { MutationCtx, QueryCtx } from './_generated/server'
import { SellerContractError, safeReason } from './lib/sellerContracts.ts'

export type SellerQueryCtx = QueryCtx
export type SellerMutationCtx = MutationCtx

export interface SellerMembership {
  merchantId: string
  role: 'owner' | 'operator'
  membershipId: string
}

export function throwSellerError(
  code: string,
  message: string,
  field: string | null = null,
): never {
  const suffix = field ? ` field=${field}` : ''
  throw new Error(`[${code}] ${message}${suffix}`)
}

export async function requireSellerMembership(
  ctx: SellerQueryCtx | SellerMutationCtx,
): Promise<SellerMembership> {
  const identity = await ctx.auth.getUserIdentity()
  const tokenIdentifier = identity?.tokenIdentifier
  if (!tokenIdentifier) throwSellerError('UNAUTHENTICATED', 'seller authentication is required')
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_authTokenIdentifier', (query) => query.eq('authTokenIdentifier', tokenIdentifier))
    .collect()
  const active = memberships.filter((membership) => membership.enabled)
  if (active.length !== 1) {
    throwSellerError('UNAUTHORIZED', 'seller membership is missing or ambiguous')
  }
  const membership = active[0]
  return {
    merchantId: membership.merchantId,
    role: membership.role,
    membershipId: membership._id,
  }
}

export async function requireMerchant(
  ctx: SellerQueryCtx | SellerMutationCtx,
  merchantId: string,
) {
  const merchants = await ctx.db
    .query('merchants')
    .withIndex('by_merchantId', (query) => query.eq('merchantId', merchantId))
    .collect()
  if (merchants.length !== 1) throwSellerError('MERCHANT_NOT_FOUND', 'merchant was not found')
  return merchants[0]
}

export function assertExpectedRef(
  actual: { id: string; version: number } | null,
  expected: { id: string; version: number } | null,
  field: string,
) {
  if (actual?.id !== expected?.id || actual?.version !== expected?.version) {
    throwSellerError('POLICY_VERSION_STALE', 'the supplied version is stale', field)
  }
}

export function validationError(error: unknown) {
  if (error instanceof SellerContractError) {
    return { ok: false as const, reasons: [safeReason(error.code, error.message, error.field)] }
  }
  return { ok: false as const, reasons: [safeReason('INVALID_INPUT', 'seller operation failed safely')] }
}

export async function payloadDigest(payload: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(payload))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded)
  const bytes = new Uint8Array(digest)
  return `sha256:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function assertBoundedCursor(cursor: string | null): number {
  if (cursor === null) return 0
  if (!/^\d{1,16}$/.test(cursor)) throwSellerError('INVALID_INPUT', 'cursor is invalid', 'cursor')
  const timestamp = Number(cursor)
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throwSellerError('INVALID_INPUT', 'cursor is invalid', 'cursor')
  return timestamp
}
