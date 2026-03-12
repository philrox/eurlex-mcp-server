import { describe, test, expect } from 'vitest'

describe('session cleanup', () => {
  test('SESSION_TTL_MS is exported from constants', async () => {
    const { SESSION_TTL_MS } = await import('../src/constants.js')
    expect(SESSION_TTL_MS).toBeGreaterThan(0)
  })
})
