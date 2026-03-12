import { randomUUID } from 'node:crypto'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'

import { SESSION_TTL_MS } from './constants.js'
import { createServer } from './server.js'

// Rate limiting: each MCP request triggers upstream EUR-Lex API calls
export const mcpLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.headers['mcp-session-id'] as string) || req.ip || 'unknown',
  message: { error: 'Too many requests. Please try again later.' },
  validate: { keyGeneratorIpFallback: false },
})

export function createApp(): {
  app: express.Express
  transports: Map<string, StreamableHTTPServerTransport>
  lastSeen: Map<string, number>
} {
  const app = express()
  app.use(express.json())
  app.use('/mcp', mcpLimiter)

  const transports = new Map<string, StreamableHTTPServerTransport>()
  const lastSeen = new Map<string, number>()

  // Sweep stale sessions (unref'd so it doesn't prevent exit)
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [sid, ts] of lastSeen) {
      if (now - ts > SESSION_TTL_MS) {
        const t = transports.get(sid)
        if (t) {
          t.close?.()
          transports.delete(sid)
        }
        lastSeen.delete(sid)
      }
    }
  }, 60_000)
  sweep.unref()

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'eurlex-mcp-server',
      activeSessions: transports.size,
    })
  })

  // POST /mcp — create or reuse session
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!
      lastSeen.set(sessionId, Date.now())
      await transport.handleRequest(req, res, req.body)
      return
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'First request must be an initialize request' })
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport)
        lastSeen.set(sid, Date.now())
      },
    })

    transport.onclose = () => {
      const sid = transport.sessionId
      if (sid) {
        transports.delete(sid)
        lastSeen.delete(sid)
      }
    }

    const server = createServer()
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })

  // GET /mcp — SSE on existing session
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' })
      return
    }
    const transport = transports.get(sessionId)!
    await transport.handleRequest(req, res)
  })

  // DELETE /mcp — session cleanup
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' })
      return
    }
    const transport = transports.get(sessionId)!
    await transport.handleRequest(req, res)
  })

  return { app, transports, lastSeen }
}

// ---------------------------------------------------------------------------
// Auto-start (guarded — does not run during tests)
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const { app } = createApp()
  const PORT = process.env.PORT ?? 3001
  app.listen(Number(PORT), () => {
    console.log(`eurlex-mcp-server listening on http://localhost:${PORT}`)
  })
}
