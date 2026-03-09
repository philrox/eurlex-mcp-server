import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the SDK — avoid real McpServer initialization
// ---------------------------------------------------------------------------
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    tool: vi.fn(),
    prompt: vi.fn(),
  })),
}))

// ---------------------------------------------------------------------------
// Mock registration modules — spy on whether createServer calls them
// ---------------------------------------------------------------------------
vi.mock('../src/tools/search.js', () => ({
  registerSearchTool: vi.fn(),
}))

vi.mock('../src/tools/fetch.js', () => ({
  registerFetchTool: vi.fn(),
}))

vi.mock('../src/prompts/guide.js', () => ({
  registerGuidePrompt: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Reset mocks and module registry between tests for isolation
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

// ===========================================================================
// Tests S1-S4: createServer() factory function
// ===========================================================================
describe('createServer()', () => {
  it('S1 – createServer returns an McpServer instance', async () => {
    const { createServer } = await import('../src/index.js')
    const server = createServer()

    expect(server).toBeDefined()
    expect(typeof server.connect).toBe('function')
  })

  it('S2 – createServer calls registerSearchTool', async () => {
    const { registerSearchTool } = await import('../src/tools/search.js')
    const { createServer } = await import('../src/index.js')

    createServer()

    expect(registerSearchTool).toHaveBeenCalledOnce()
  })

  it('S3 – createServer calls registerFetchTool', async () => {
    const { registerFetchTool } = await import('../src/tools/fetch.js')
    const { createServer } = await import('../src/index.js')

    createServer()

    expect(registerFetchTool).toHaveBeenCalledOnce()
  })

  it('S4 – createServer calls registerGuidePrompt', async () => {
    const { registerGuidePrompt } = await import('../src/prompts/guide.js')
    const { createServer } = await import('../src/index.js')

    createServer()

    expect(registerGuidePrompt).toHaveBeenCalledOnce()
  })
})
