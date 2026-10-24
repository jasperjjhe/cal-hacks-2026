import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const schema = JSON.parse(await readFile(resolve(root, 'convex', 'lib', 'seller.schema.json'), 'utf8'))

test('seller worker schema is strict and excludes private buyer/seller fields from provider input', () => {
  assert.equal(schema.$id, 'https://buyerunion.local/contracts/seller.v1.schema.json')
  assert.deepEqual(schema.$defs.SellerBrief.required, [
    'schemaVersion', 'request', 'runId', 'currency', 'deliveryRegion', 'deliveryDeadline', 'lines', 'sharedTarget',
  ])
  assert.equal(schema.$defs.SellerBrief.additionalProperties, false)
  assert.equal(schema.$defs.SellerDecision.oneOf.length, 3)
  for (const forbidden of [
    'privateMaximumCents',
    'rawMessages',
    'origins',
    'operatorFloorCents',
    'unitCostByListing',
    'minimumContributionByListing',
    'competitorCosts',
  ]) {
    assert.equal(JSON.stringify(schema).includes(forbidden), false, `schema unexpectedly exposes ${forbidden}`)
  }
})
