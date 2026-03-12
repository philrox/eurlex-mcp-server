# Contributing to eurlex-mcp-server

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- **Node.js** >= 20
- **pnpm** (install via `corepack enable`)

## Getting Started

```bash
# Fork and clone the repository
git clone https://github.com/<your-username>/eurlex-mcp-server.git
cd eurlex-mcp-server

# Install dependencies
pnpm install

# Build
pnpm build

# Run checks
pnpm test
```

## Architecture Overview

```
src/
  index.ts          # Entry point — stdio/HTTP transport selection
  server.ts         # MCP server setup, tool registration
  constants.ts      # Shared constants (endpoints, regex, limits)
  types.ts          # Shared TypeScript types
  utils.ts          # Utility functions
  schemas/          # Zod schemas for tool input validation
    searchSchema.ts
    fetchSchema.ts
    metadataSchema.ts
    citationsSchema.ts
    eurovocSchema.ts
    consolidatedSchema.ts
  tools/            # Tool implementations (one file per tool)
    search.ts
    fetch.ts
    metadata.ts
    citations.ts
    eurovoc.ts
    consolidated.ts
  services/
    cellarClient.ts # HTTP/SPARQL client for EUR-Lex Cellar API
  prompts/          # MCP prompt templates
```

**Data flow:**

```
MCP Client → index.ts → server.ts → tools/*.ts → cellarClient.ts → EUR-Lex Cellar API
```

## Development Workflow

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with hot reload (tsx watch) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm test` | Run unit tests with Vitest |
| `pnpm test:integration` | Run integration tests against live API |

## Code Conventions

- **English tool descriptions** -- all user-facing tool names and descriptions are in English.
- **ESM with `.js` extensions** -- import paths use `.js` extensions (TypeScript ESM convention).
- **Type imports** -- use `import type { ... }` for type-only imports.
- **Strict Zod schemas** -- all tool inputs are validated with `.strict()` schemas (no extra properties).
- **No `any`** -- avoid `any` types; use `unknown` and narrow with type guards.

## Formatting & Linting

The project uses:

- **Prettier** for code formatting
- **ESLint** for linting
- **Husky** pre-commit hooks to enforce both

Before committing, ensure your code passes:

```bash
pnpm build   # type-check
pnpm test    # unit tests
```

The pre-commit hook will run formatting and linting automatically.

## Writing Tests

- **Framework**: Vitest
- **Location**: `tests/` directory (mirrors `src/` structure)
- **HTTP mocking**: Mock `cellarClient.ts` functions -- do not make real HTTP calls in unit tests
- **Integration tests**: Placed in separate files, run with `pnpm test:integration`

Example test structure:

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('toolName', () => {
  it('should return results for valid input', async () => {
    // Arrange: mock the cellar client
    // Act: call the tool handler
    // Assert: verify the response
  })
})
```

## Adding a New Tool

1. **Define the schema** in `src/schemas/<toolName>Schema.ts`:

   ```typescript
   import { z } from 'zod'

   export const myToolSchema = z.object({
     param: z.string().describe('Description of param'),
   }).strict()

   export type MyToolInput = z.infer<typeof myToolSchema>
   ```

2. **Implement the tool** in `src/tools/<toolName>.ts`:

   ```typescript
   import type { MyToolInput } from '../schemas/myToolSchema.js'
   import { cellarClient } from '../services/cellarClient.js'

   export async function myTool(input: MyToolInput) {
     // Build SPARQL query or REST call
     // Call cellarClient
     // Transform and return results
   }
   ```

3. **Register the tool** in `src/server.ts` -- add it to the tool registration section.

4. **Write tests** in `tests/tools/<toolName>.test.ts`.

## Submitting Changes

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/my-change
   ```

2. **Run all checks** before pushing:
   ```bash
   pnpm build && pnpm test
   ```

3. **Use conventional commits**:
   - `feat: add new tool for ...`
   - `fix: handle empty SPARQL response`
   - `docs: update README`
   - `refactor: extract shared query builder`
   - `test: add coverage for citations tool`
   - `chore: update dependencies`

4. **Open a Pull Request** against `main` with a clear description of what changed and why.

## Releasing

Releases are triggered by version tags:

```bash
pnpm version patch   # or minor / major
git push --tags
```

This publishes to npm via CI.

## Questions?

Open an issue on [GitHub](https://github.com/philrox/eurlex-mcp-server/issues) -- we are happy to help.
