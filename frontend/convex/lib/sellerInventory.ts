import type { Cents, Id, Ms, OfferLine, SafeReason } from './sellerContracts.ts'
import { SellerContractError, safeReason } from './sellerContracts.ts'

export type AllocationState = 'reserved' | 'execution_locked' | 'sold' | 'released'

export interface InventoryAllocation {
  allocationId: Id
  reservationKey: string
  requestId: Id
  quoteId: Id
  merchantId: Id
  requestLineId: Id
  listingId: Id
  listingVersion: number
  quantity: number
  unitCents: Cents
  state: AllocationState
  expiresAt: Ms
  createdAt: Ms
}

export interface InventoryState {
  initialQuantityByListing: Record<Id, number>
  allocations: InventoryAllocation[]
}

export interface ReservationResult {
  state: InventoryState
  allocations: InventoryAllocation[]
  replayed: boolean
}

export interface ReserveInput {
  allocationIdPrefix: string
  reservationKey: string
  requestId: Id
  quoteId: Id
  merchantId: Id
  lines: OfferLine[]
  expiresAt: Ms
  now: Ms
}

const MAX_RESERVATION_MS = 15 * 60 * 1_000

function assertSafeQuantity(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new SellerContractError('QUANTITY_INVALID', `${label} must be an integer from 1 to 10`, label)
  }
}

function assertSafeId(value: string, label: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) || value.length > 128) {
    throw new SellerContractError('INVALID_INPUT', `${label} is not a bounded opaque identifier`, label)
  }
}

function isActive(allocation: InventoryAllocation, now: Ms): boolean {
  if (allocation.state === 'execution_locked' || allocation.state === 'sold') return true
  return allocation.state === 'reserved' && allocation.expiresAt > now
}

function quantityUsed(state: InventoryState, listingId: Id, now: Ms): number {
  return state.allocations
    .filter((allocation) => allocation.listingId === listingId && isActive(allocation, now))
    .reduce((sum, allocation) => sum + allocation.quantity, 0)
}

function sameLineSet(left: OfferLine[], right: OfferLine[]): boolean {
  if (left.length !== right.length) return false
  const normalize = (lines: OfferLine[]) => lines
    .map((line) => `${line.requestLineId}:${line.listing.id}:${line.listing.version}:${line.quantity}:${line.unitCents}`)
    .sort()
  return normalize(left).every((value, index) => value === normalize(right)[index])
}

export function reserveInTransaction(state: InventoryState, input: ReserveInput): ReservationResult {
  assertSafeId(input.reservationKey, 'reservationKey')
  assertSafeId(input.requestId, 'requestId')
  assertSafeId(input.quoteId, 'quoteId')
  if (!Number.isSafeInteger(input.now) || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= input.now) {
    throw new SellerContractError('INVALID_INPUT', 'reservation expiry must be in the future')
  }
  if (input.expiresAt - input.now > MAX_RESERVATION_MS) {
    throw new SellerContractError('INVALID_INPUT', 'reservation expiry exceeds the hold limit')
  }
  if (input.lines.length === 0 || input.lines.length > 3) {
    throw new SellerContractError('INVALID_INPUT', 'a reservation must contain one to three lines')
  }
  const existing = state.allocations.filter((allocation) => allocation.reservationKey === input.reservationKey)
  if (existing.length > 0) {
    const sameReservation = existing.every(
      (allocation) => allocation.requestId === input.requestId && allocation.quoteId === input.quoteId && allocation.merchantId === input.merchantId,
    ) && sameLineSet(input.lines, existing.map((allocation) => ({
      requestLineId: allocation.requestLineId,
      listing: { id: allocation.listingId, version: allocation.listingVersion },
      quantity: allocation.quantity,
      unitCents: allocation.unitCents,
    })))
    if (!sameReservation) {
      throw new SellerContractError('REPLAY_REJECTED', 'reservation key was already used with a different payload')
    }
    return { state, allocations: existing, replayed: true }
  }
  const uniqueListings = new Set<string>()
  for (const line of input.lines) {
    if (uniqueListings.has(line.listing.id)) {
      throw new SellerContractError('DUPLICATE_LINE', 'a reservation cannot reserve the same listing twice')
    }
    uniqueListings.add(line.listing.id)
    assertSafeQuantity(line.quantity, `lines.${line.requestLineId}.quantity`)
    const initial = state.initialQuantityByListing[line.listing.id]
    if (!Number.isSafeInteger(initial) || initial < 0) {
      throw new SellerContractError('INVALID_INPUT', 'listing inventory is missing or invalid', line.listing.id)
    }
    if (quantityUsed(state, line.listing.id, input.now) + line.quantity > initial) {
      throw new SellerContractError('QUANTITY_UNAVAILABLE', 'one or more requested units are no longer available', line.listing.id)
    }
  }
  const allocations = input.lines.map((line, index) => ({
    allocationId: `${input.allocationIdPrefix}:${index + 1}`,
    reservationKey: input.reservationKey,
    requestId: input.requestId,
    quoteId: input.quoteId,
    merchantId: input.merchantId,
    requestLineId: line.requestLineId,
    listingId: line.listing.id,
    listingVersion: line.listing.version,
    quantity: line.quantity,
    unitCents: line.unitCents,
    state: 'reserved' as const,
    expiresAt: input.expiresAt,
    createdAt: input.now,
  }))
  return {
    state: { ...state, allocations: [...state.allocations, ...allocations] },
    allocations,
    replayed: false,
  }
}

export type AllocationTransition = 'lock' | 'sell' | 'release'

export function transitionAllocationInTransaction(
  state: InventoryState,
  allocationId: Id,
  transition: AllocationTransition,
  now: Ms,
): InventoryState {
  const index = state.allocations.findIndex((allocation) => allocation.allocationId === allocationId)
  if (index < 0) throw new SellerContractError('INVALID_INPUT', 'allocation was not found', allocationId)
  const allocation = state.allocations[index]
  let nextState: AllocationState
  if (transition === 'lock' && allocation.state === 'reserved') {
    if (allocation.expiresAt <= now) throw new SellerContractError('LATE_COMPLETION', 'reservation has expired', allocationId)
    nextState = 'execution_locked'
  } else if (transition === 'sell' && allocation.state === 'execution_locked') {
    nextState = 'sold'
  } else if (transition === 'release' && allocation.state === 'reserved') {
    nextState = 'released'
  } else {
    throw new SellerContractError('INVALID_INPUT', `invalid allocation transition from ${allocation.state}`, allocationId)
  }
  const nextAllocation = { ...allocation, state: nextState }
  const allocations = [...state.allocations]
  allocations[index] = nextAllocation
  return { ...state, allocations }
}

export function releaseExpiredReservations(state: InventoryState, now: Ms): InventoryState {
  return {
    ...state,
    allocations: state.allocations.map((allocation) =>
      allocation.state === 'reserved' && allocation.expiresAt <= now
        ? { ...allocation, state: 'released' }
        : allocation,
    ),
  }
}

export function availableQuantity(state: InventoryState, listingId: Id, now: Ms): number {
  const initial = state.initialQuantityByListing[listingId]
  if (!Number.isSafeInteger(initial) || initial < 0) return 0
  return Math.max(0, initial - quantityUsed(state, listingId, now))
}

export function allocationSafeReasons(error: unknown): SafeReason[] {
  if (error instanceof SellerContractError) {
    return [safeReason(error.code, error.message, error.field)]
  }
  return [safeReason('INVALID_INPUT', 'allocation operation failed safely')]
}

export function allocationValueCents(lines: OfferLine[]): Cents {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0)
  if (!Number.isSafeInteger(total) || total < 0) throw new SellerContractError('INVALID_INPUT', 'allocation value overflowed safe integer bounds')
  return total
}
