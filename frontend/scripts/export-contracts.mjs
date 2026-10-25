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
const sellerSchema = {
  $schema: schema.$schema,
  $id: 'https://buyerunion.local/contracts/seller.v1.schema.json',
  $comment: 'Request envelopes remain v1; council and final decision envelopes are v2. Generated from the canonical registry.',
  oneOf: ['SellerBrief', 'SellerDecision', 'CouncilJobInput', 'SellerAdvocacy', 'SellerReply', 'SellerFinalDecision', 'SellerFinalJobInput'].map(name => ({ $ref: `#/$defs/${name}` })),
  $defs: Object.fromEntries(['SellerBrief', 'SellerDecision', 'SellerProposal', 'CouncilJobInput', 'SellerAdvocacy', 'SellerReply', 'SellerFinalDecision', 'SellerFinalJobInput'].map(name => [name, schema.$defs[name]])),
}
for (const [file, value] of [[target, schema], [new URL('../convex/lib/seller.schema.json', import.meta.url), sellerSchema]]) {
  const content = `${JSON.stringify(value, null, 2)}\n`
  if (process.argv.includes('--check')) {
    if (await readFile(file, 'utf8') !== content) throw new Error('Contract export is stale; run npm run contracts:export')
  } else await writeFile(file, content)
}
console.log('Application and seller worker schemas match the canonical runtime contracts.')
