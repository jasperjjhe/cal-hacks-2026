import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoDir = resolve(scriptDir, '..', '..')
const workflowsDir = resolve(repoDir, '.github', 'workflows')

let names
try {
  names = await readdir(workflowsDir)
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('Workflow policy passed: no GitHub Actions workflows are present.')
    process.exit(0)
  }
  throw error
}

const failures = []
const workflowNames = names.filter((name) => ['.yml', '.yaml'].includes(extname(name)))

for (const name of workflowNames) {
  const path = resolve(workflowsDir, name)
  const source = await readFile(path, 'utf8')

  if (!/^\s*permissions\s*:/m.test(source)) {
    failures.push(`${name}: workflow must declare least-privilege permissions`)
  }
  if (/\bpull_request_target\s*:/m.test(source) || /\bworkflow_run\s*:/m.test(source)) {
    failures.push(`${name}: privileged trigger requires a separate security review and is not allowed by default`)
  }
  if (/(curl|wget)[^\r\n]*\|\s*(ba|z)?sh\b/i.test(source)) {
    failures.push(`${name}: downloading and piping an unreviewed script into a shell is forbidden`)
  }

  for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)\s*$/gm)) {
    const action = match[1]
    if (action.startsWith('./') || action.startsWith('docker://')) continue
    if (!/@[0-9a-f]{40}$/.test(action)) {
      failures.push(`${name}: action ${action} is not pinned to a full commit SHA`)
    }
  }

  if (/shai[-_ ]?hulud|formatter_[^\s/]+\.ya?ml/i.test(name)) {
    failures.push(`${name}: suspicious Shai-Hulud-style workflow filename is blocked`)
  }
}

if (failures.length) {
  console.error('Workflow policy failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Workflow policy passed for ${workflowNames.length} workflow file(s).`)
}
