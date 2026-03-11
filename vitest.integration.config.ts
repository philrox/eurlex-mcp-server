import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    include: [
      'tests/integration/**/*.test.ts',
      'tests/eval/**/*.test.ts',
    ],
  }
})
