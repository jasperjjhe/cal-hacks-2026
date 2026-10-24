import test from 'node:test'
import assert from 'node:assert/strict'
import { isReleaseOldEnough, MILLISECONDS_PER_DAY, releaseAgeDays } from './release-age.mjs'

const now = Date.parse('2026-10-24T00:00:00.000Z')

test('a package exactly seven days old is allowed', () => {
  const published = now - 7 * MILLISECONDS_PER_DAY
  assert.equal(isReleaseOldEnough(published, 7, now), true)
  assert.equal(releaseAgeDays(published, now), 7)
})

test('a package one millisecond younger than seven days is blocked', () => {
  const published = now - 7 * MILLISECONDS_PER_DAY + 1
  assert.equal(isReleaseOldEnough(published, 7, now), false)
})

test('a package older than seven days is allowed', () => {
  const published = now - 7 * MILLISECONDS_PER_DAY - 1
  assert.equal(isReleaseOldEnough(published, 7, now), true)
})

test('future or invalid publication dates are not accepted', () => {
  assert.equal(isReleaseOldEnough(now + 1, 7, now), false)
  assert.throws(() => releaseAgeDays('not-a-date', now), /invalid package publication timestamp/)
})
