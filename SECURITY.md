# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in eurlex-mcp-server, please report it responsibly.

**Email:** [security@philrox.at](mailto:security@philrox.at)

Please include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Do not** open a public GitHub issue for security vulnerabilities.

## Response Timeline

| Stage | Timeline |
|-------|----------|
| Acknowledgement | Within 48 hours |
| Assessment | Within 7 days |
| Fix target | Within 90 days |

We will keep you informed of progress and credit you in the advisory (unless you prefer otherwise).

## Scope

### In scope

- **SPARQL injection** -- crafted input that manipulates SPARQL queries sent to the Cellar API
- **Information disclosure** -- unintended exposure of internal state or server details
- **Dependency vulnerabilities** -- known CVEs in direct or transitive dependencies
- **Input validation bypasses** -- circumventing Zod schema validation

### Out of scope

- **EUR-Lex Cellar API issues** -- vulnerabilities in the upstream API itself (report to the EU Publications Office)
- **MCP specification issues** -- vulnerabilities in the MCP protocol (report to [modelcontextprotocol.io](https://modelcontextprotocol.io/))
- **Denial of Service (DoS)** -- resource exhaustion attacks against the server
- **Social engineering** -- phishing or other non-technical attacks

## Security Measures

This project implements the following security practices:

- **Zod input validation** -- all tool inputs are validated against strict Zod schemas before processing. No extra properties are accepted.
- **No credentials stored** -- the EUR-Lex Cellar API is a public endpoint that requires no API keys or authentication.
- **Response size limits** -- full-text responses are capped at a configurable `max_chars` (default 20,000, max 50,000) to prevent excessive memory usage.
- **Parameterized SPARQL** -- query values are escaped and interpolated safely to prevent SPARQL injection.
- **Dependency auditing** -- dependencies are kept minimal and regularly audited.
