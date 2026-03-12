import { describe, test, expect, afterEach } from 'vitest'
import http from 'node:http'
import { createApp } from '../src/index.js'

/** Start Express app on a random port, return base URL + close fn + internals */
function startServer() {
  const { app, transports, lastSeen } = createApp()
  const server = http.createServer(app)

  return new Promise<{
    baseUrl: string
    close: () => Promise<void>
    transports: typeof transports
    lastSeen: typeof lastSeen
  }>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number }
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        transports,
        lastSeen,
      })
    })
  })
}

const INIT_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
}

describe('HTTP transport', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    if (close) {
      await close()
      close = undefined
    }
  })

  // --- SESSION_TTL_MS ---

  test('SESSION_TTL_MS is exported from constants', async () => {
    const { SESSION_TTL_MS } = await import('../src/constants.js')
    expect(SESSION_TTL_MS).toBeGreaterThan(0)
  })

  // --- createApp shape ---

  test('createApp returns app, transports, and lastSeen', () => {
    const result = createApp()
    expect(result.app).toBeDefined()
    expect(result.transports).toBeInstanceOf(Map)
    expect(result.lastSeen).toBeInstanceOf(Map)
    expect(result.transports.size).toBe(0)
  })

  // --- GET /health ---

  test('GET /health returns 200 with status ok', async () => {
    const srv = await startServer()
    close = srv.close

    const res = await fetch(`${srv.baseUrl}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', server: 'eurlex-mcp-server' })
  })

  // --- POST /mcp errors ---

  test('POST /mcp without initialize request returns 400', async () => {
    const srv = await startServer()
    close = srv.close

    const res = await fetch(`${srv.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/initialize/i)
  })

  // --- POST /mcp initialize ---

  test('POST /mcp with initialize returns 200 and session ID', async () => {
    const srv = await startServer()
    close = srv.close

    const res = await fetch(`${srv.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(INIT_BODY),
    })
    expect(res.status).toBe(200)

    const sessionId = res.headers.get('mcp-session-id')
    expect(sessionId).toBeTruthy()
    expect(srv.transports.size).toBe(1)
    expect(srv.lastSeen.size).toBe(1)
  })

  // --- POST /mcp session reuse ---

  test('POST /mcp reuses existing session and updates lastSeen', async () => {
    const srv = await startServer()
    close = srv.close

    // Initialize
    const initRes = await fetch(`${srv.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(INIT_BODY),
    })
    const sessionId = initRes.headers.get('mcp-session-id')!

    // Send initialized notification
    await fetch(`${srv.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': sessionId,
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })

    const firstSeen = srv.lastSeen.get(sessionId)
    expect(firstSeen).toBeDefined()

    // Reuse session
    const res = await fetch(`${srv.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': sessionId,
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
    })
    expect(res.status).toBe(200)
    expect(srv.lastSeen.get(sessionId)).toBeGreaterThanOrEqual(firstSeen!)
  })

  // --- GET /mcp errors ---

  test('GET /mcp without session ID returns 400', async () => {
    const srv = await startServer()
    close = srv.close

    const res = await fetch(`${srv.baseUrl}/mcp`)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/session/i)
  })

  test('GET /mcp with invalid session ID returns 400', async () => {
    const srv = await startServer()
    close = srv.close

    const res = await fetch(`${srv.baseUrl}/mcp`, {
      headers: { 'mcp-session-id': 'nonexistent' },
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/session/i)
  })

  // --- DELETE /mcp errors ---

  test('DELETE /mcp without session ID returns 400', async () => {
    const srv = await startServer()
    close = srv.close

    const res = await fetch(`${srv.baseUrl}/mcp`, { method: 'DELETE' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/session/i)
  })

  test('DELETE /mcp with invalid session ID returns 400', async () => {
    const srv = await startServer()
    close = srv.close

    const res = await fetch(`${srv.baseUrl}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': 'nonexistent' },
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/session/i)
  })
})
