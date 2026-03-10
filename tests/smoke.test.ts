import { describe, it, expect, afterEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/index.js'

// ---------------------------------------------------------------------------
// Helper: spin up a server + client pair over in-memory transport
// ---------------------------------------------------------------------------
async function createTestPair() {
  const server = createServer()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return { server, client, clientTransport, serverTransport }
}

// ---------------------------------------------------------------------------
// Phase 5 – Smoke / Capability Tests (no real API calls)
// ---------------------------------------------------------------------------
describe('Phase 5 – Smoke Tests', () => {
  const pairs: Array<{ client: Client; clientTransport: any; serverTransport: any }> = []

  afterEach(async () => {
    for (const pair of pairs) {
      try {
        await pair.clientTransport.close()
        await pair.serverTransport.close()
      } catch {
        // ignore cleanup errors
      }
    }
    pairs.length = 0
  })

  // V17: Server startet → createServer() returns a valid McpServer
  it('V17 – createServer() returns a functional McpServer that accepts connections', async () => {
    const pair = await createTestPair()
    pairs.push(pair)

    // If we got here without throwing, the server started and accepted a connection.
    // Verify the client can communicate by listing tools (basic protocol handshake succeeded).
    const { tools } = await pair.client.listTools()
    expect(tools).toBeDefined()
    expect(Array.isArray(tools)).toBe(true)
  })

  // V18: MCP Inspector zeigt 2 Tools → server has eurlex_search + eurlex_fetch registered
  it('V18 – server exposes exactly eurlex_search and eurlex_fetch tools', async () => {
    const pair = await createTestPair()
    pairs.push(pair)

    const { tools } = await pair.client.listTools()
    const toolNames = tools.map((t) => t.name).sort()

    expect(toolNames).toEqual(['eurlex_fetch', 'eurlex_metadata', 'eurlex_search'])
  })

  // V20: Session-Management → factory creates independent servers per call
  it('V20 – factory creates independent server instances per call', async () => {
    const pair1 = await createTestPair()
    const pair2 = await createTestPair()
    pairs.push(pair1, pair2)

    // Both servers should be operational independently
    const { tools: tools1 } = await pair1.client.listTools()
    const { tools: tools2 } = await pair2.client.listTools()

    expect(tools1.map((t) => t.name).sort()).toEqual(['eurlex_fetch', 'eurlex_metadata', 'eurlex_search'])
    expect(tools2.map((t) => t.name).sort()).toEqual(['eurlex_fetch', 'eurlex_metadata', 'eurlex_search'])

    // They should be distinct object instances
    expect(pair1.server).not.toBe(pair2.server)
  })

  // Annotations: both tools have readOnlyHint: true, destructiveHint: false
  it('eurlex_search has annotations readOnlyHint=true, destructiveHint=false', async () => {
    const pair = await createTestPair()
    pairs.push(pair)

    const { tools } = await pair.client.listTools()
    const search = tools.find((t) => t.name === 'eurlex_search')

    expect(search?.annotations).toBeDefined()
    expect(search?.annotations?.readOnlyHint).toBe(true)
    expect(search?.annotations?.destructiveHint).toBe(false)
  })

  it('eurlex_fetch has annotations readOnlyHint=true, destructiveHint=false', async () => {
    const pair = await createTestPair()
    pairs.push(pair)

    const { tools } = await pair.client.listTools()
    const fetch = tools.find((t) => t.name === 'eurlex_fetch')

    expect(fetch?.annotations).toBeDefined()
    expect(fetch?.annotations?.readOnlyHint).toBe(true)
    expect(fetch?.annotations?.destructiveHint).toBe(false)
  })

  it('eurlex_metadata has annotations readOnlyHint=true, destructiveHint=false', async () => {
    const pair = await createTestPair()
    pairs.push(pair)

    const { tools } = await pair.client.listTools()
    const metadata = tools.find((t) => t.name === 'eurlex_metadata')

    expect(metadata?.annotations).toBeDefined()
    expect(metadata?.annotations?.readOnlyHint).toBe(true)
    expect(metadata?.annotations?.destructiveHint).toBe(false)
  })

  // V22: eurlex_guide Prompt abrufbar → server has eurlex_guide prompt registered
  it('V22 – server exposes eurlex_guide prompt', async () => {
    const pair = await createTestPair()
    pairs.push(pair)

    const { prompts } = await pair.client.listPrompts()
    const promptNames = prompts.map((p) => p.name)

    expect(promptNames).toContain('eurlex_guide')
  })
})
