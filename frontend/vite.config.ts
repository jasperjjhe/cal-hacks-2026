import react from '@vitejs/plugin-react'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Connect, Plugin } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))
const inventoryFile = resolve(root, 'data/seller-inventory.json')
const inventoryRoute = '/api/seller-inventory'
const maxBodyBytes = 2_000_000

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBodyBytes) {
        fail(new Error('too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
    req.on('error', fail)
  })
}

function send(res: ServerResponse, status: number, body: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

// Local-only persistence for the seller prototype: the dev/preview server reads and
// writes frontend/data/seller-inventory.json. Static production builds don't have this route.
const handleInventory: Connect.NextHandleFunction = (req, res, next) => {
  if (req.url?.split('?')[0] !== inventoryRoute) return next()
  void (async () => {
    if (req.method === 'GET') {
      try {
        send(res, 200, await readFile(inventoryFile, 'utf8'))
      } catch {
        send(res, 404, '{"error":"not found"}')
      }
      return
    }
    if (req.method === 'PUT') {
      if (!req.headers['content-type']?.startsWith('application/json')) {
        send(res, 415, '{"error":"expected application/json"}')
        return
      }
      try {
        const parsed: unknown = JSON.parse(await readBody(req))
        if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { products?: unknown }).products)) {
          send(res, 400, '{"error":"expected an inventory object"}')
          return
        }
        await mkdir(dirname(inventoryFile), { recursive: true })
        const temp = `${inventoryFile}.tmp`
        await writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`)
        await rename(temp, inventoryFile)
        send(res, 200, '{"ok":true}')
      } catch {
        send(res, 400, '{"error":"could not save inventory"}')
      }
      return
    }
    res.setHeader('Allow', 'GET, PUT')
    send(res, 405, '{"error":"method not allowed"}')
  })()
}

function sellerInventoryFile(): Plugin {
  return {
    name: 'seller-inventory-file',
    configureServer(server) {
      server.middlewares.use(handleInventory)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleInventory)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sellerInventoryFile()],
  server: {
    // Saving the inventory file shouldn't trigger a reload.
    watch: { ignored: ['**/data/**'] },
  },
})
