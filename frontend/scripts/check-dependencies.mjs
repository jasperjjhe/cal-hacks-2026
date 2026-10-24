import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isReleaseOldEnough, releaseAgeDays } from './release-age.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectDir = resolve(scriptDir, '..')
const repoDir = resolve(projectDir, '..')
const policyPath = resolve(repoDir, 'security', 'dependency-policy.json')
const allowlistPath = resolve(repoDir, 'security', 'allowed-install-scripts.json')
const blocklistPath = resolve(repoDir, 'security', 'known-compromised-npm.json')
const lockfilePath = resolve(projectDir, 'package-lock.json')

const args = new Set(process.argv.slice(2))
const offline = args.has('--offline')
const failures = []
const warnings = []

function fail(message) {
  failures.push(message)
}

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/'
  const markerIndex = lockPath.lastIndexOf(marker)
  return markerIndex >= 0 ? lockPath.slice(markerIndex + marker.length) : null
}

function registryPathFor(name) {
  return name.split('/').map(encodeURIComponent).join('/')
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function consume() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => consume()),
  )
  return results
}

const [policy, allowlist, blocklist, lockfile] = await Promise.all([
  readJson(policyPath),
  readJson(allowlistPath),
  readJson(blocklistPath),
  readJson(lockfilePath),
])

if (policy.maxReleaseAgeDays !== 7) {
  fail(`security policy must enforce maxReleaseAgeDays=7, found ${policy.maxReleaseAgeDays}`)
}
if (policy.requireLockfileVersion !== lockfile.lockfileVersion) {
  fail(
    `package-lock.json must use lockfileVersion=${policy.requireLockfileVersion}, found ${lockfile.lockfileVersion}`,
  )
}
if (offline && (process.env.CI === 'true' || process.env.CI === '1')) {
  fail('--offline is forbidden in CI because it skips the package release-age check')
}

const entries = Object.entries(lockfile.packages ?? {}).filter(
  ([lockPath, entry]) => lockPath !== '' && entry && !entry.link,
)
const packages = new Map()

for (const [lockPath, entry] of entries) {
  const name = entry.name ?? packageNameFromLockPath(lockPath)
  const version = entry.version
  if (!name || !version) {
    fail(`${lockPath}: missing package name or version`)
    continue
  }

  if (entry.resolved) {
    try {
      const resolved = new URL(entry.resolved)
      if (
        policy.requireRegistryOnly &&
        (resolved.protocol !== 'https:' || resolved.hostname !== 'registry.npmjs.org')
      ) {
        fail(`${name}@${version}: resolved outside the approved npm registry`)
      }
    } catch {
      fail(`${name}@${version}: invalid resolved URL in package-lock.json`)
    }
  } else {
    fail(`${name}@${version}: missing tarball resolved URL`)
  }

  if (policy.requireSha512Integrity && !entry.integrity?.startsWith('sha512-')) {
    fail(`${name}@${version}: missing sha512 integrity`)
  }

  if (blocklist.blocked?.[name]?.includes(version)) {
    fail(`${name}@${version}: matches the emergency compromised-version blocklist`)
  }

  if (policy.denyUnreviewedInstallScripts && entry.hasInstallScript) {
    const approved = allowlist.allowed?.[name]
    if (!approved?.versions?.includes(version)) {
      fail(`${name}@${version}: install lifecycle script is not explicitly allowlisted`)
    }
  }

  packages.set(`${name}@${version}`, { name, version })
}

if (!offline) {
  const registry = new URL(policy.registry)
  const now = Date.now()
  const ageResults = await mapWithConcurrency([...packages.values()], 8, async ({ name, version }) => {
    const url = new URL(registryPathFor(name), registry)
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        return { name, version, error: `registry returned HTTP ${response.status}` }
      }
      const metadata = await response.json()
      const publishedAt = metadata.time?.[version]
      if (!publishedAt) {
        return { name, version, error: 'version has no registry publication timestamp' }
      }
      const ageDays = releaseAgeDays(publishedAt, now)
      return {
        name,
        version,
        ageDays,
        oldEnough: isReleaseOldEnough(publishedAt, policy.maxReleaseAgeDays, now),
      }
    } catch (error) {
      return {
        name,
        version,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  for (const result of ageResults) {
    if (result.error) {
      fail(`${result.name}@${result.version}: cannot verify release age (${result.error})`)
      continue
    }
    if (!result.oldEnough) {
      fail(
        `${result.name}@${result.version}: release is ${result.ageDays.toFixed(2)} days old; minimum is ${policy.maxReleaseAgeDays} days`,
      )
    }
  }
} else {
  warnings.push('offline diagnostic mode skipped registry publication-age checks; this mode must never be used by CI')
}

if (warnings.length) {
  for (const warning of warnings) console.warn(`WARN: ${warning}`)
}
if (failures.length) {
  console.error('Dependency policy failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `Dependency policy passed for ${packages.size} locked package versions${offline ? ' (offline structural checks only)' : ''}.`,
  )
}
