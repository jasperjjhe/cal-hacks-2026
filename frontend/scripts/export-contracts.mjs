import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { contracts } from '../src/contracts/index.ts'

const target = new URL('../src/contracts/schema.json', import.meta.url)
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:buyerunion:contracts:1',
  $comment: 'Generated from index.ts. DRAFT pending Dev S review. Server semantic checks are additional.',
  $defs: Object.fromEntries(Object.entries(contracts).map(([name, contract]) => {
    const { $schema: dialect, ...definition } = z.toJSONSchema(contract, { target: 'draft-2020-12' })
    if (!dialect) throw new Error(`Missing JSON Schema dialect for ${name}`)
    return [name, definition]
  })),
}
const content = `${JSON.stringify(schema, null, 2)}\n`
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== content) throw new Error('Contract export is stale; run npm run contracts:export')
  console.log('Contract JSON Schema matches the runtime schemas.')
} else {
  await writeFile(target, content)
  console.log('Exported contract JSON Schema.')
}
