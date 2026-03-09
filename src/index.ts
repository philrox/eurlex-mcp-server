import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import express, { type Request, type Response } from 'express'
import { registerSearchTool } from './tools/search.js'
import { registerFetchTool } from './tools/fetch.js'
import { registerGuidePrompt } from './prompts/guide.js'

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'eurlex-mcp-server',
    version: '1.0.0',
  })

  registerSearchTool(server)
  registerFetchTool(server)
  registerGuidePrompt(server)

  return server
}

// ---------------------------------------------------------------------------
// HTTP transport (Streamable HTTP)
// ---------------------------------------------------------------------------

export async function runHTTP(): Promise<void> {
  const app = express()
  app.use(express.json())

  const transports = new Map<string, StreamableHTTPServerTransport>()

  // POST /mcp — create or reuse session
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!
      await transport.handleRequest(req, res, req.body)
      return
    }

    // New session — must be an initialize request
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'First request must be an initialize request' })
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport)
      },
    })

    transport.onclose = () => {
      const sid = transport.sessionId
      if (sid) transports.delete(sid)
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

  // GET /health
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', server: 'eurlex-mcp-server' })
  })

  const port = process.env.PORT || '3001'
  app.listen(Number(port), () => {
    console.log(`eurlex-mcp-server listening on http://localhost:${port}`)
  })
}

// ---------------------------------------------------------------------------
// Stdio transport
// ---------------------------------------------------------------------------

export async function runStdio(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// ---------------------------------------------------------------------------
// Auto-start (guarded — does not run during tests)
// ---------------------------------------------------------------------------

if (!process.env.VITEST) {
  const mode = process.env.TRANSPORT || 'stdio'
  if (mode === 'http') {
    runHTTP()
  } else {
    runStdio()
  }
}
