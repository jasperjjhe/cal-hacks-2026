export const MILLISECONDS_PER_DAY = 86_400_000

export function releaseAgeDays(publishedAt, now = Date.now()) {
  const publishedMs = typeof publishedAt === 'number' ? publishedAt : Date.parse(publishedAt)
  if (!Number.isFinite(publishedMs)) {
    throw new Error(`invalid package publication timestamp: ${publishedAt}`)
  }
  return (now - publishedMs) / MILLISECONDS_PER_DAY
}

export function isReleaseOldEnough(publishedAt, minReleaseAgeDays, now = Date.now()) {
  return releaseAgeDays(publishedAt, now) >= minReleaseAgeDays
}
