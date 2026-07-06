# AGENTS.md

TypeScript provider guidance.

## Scope

Provider packages adapt Composio tools and sessions to AI frameworks such as OpenAI, Anthropic, Google, LangChain, Mastra, Vercel, LlamaIndex, Cloudflare, and Claude Agent SDK.

## Skill Routing

Use `typescript-providers` for provider implementation and docs/examples. Use `typescript-testing` for package tests. Use `cross-sdk-parity` when a provider has a Python counterpart.

## Commands

Run from the repository root:

```bash
pnpm create:provider <provider-name> [--agentic]
pnpm --filter @composio/<provider> test
pnpm --filter @composio/<provider> typecheck
pnpm build:packages
```

## Rules

- Keep provider-specific behavior inside the provider package.
- Preserve framework-native tool shapes and naming conventions.
- Add tests that cover wrapping, execution handling, and version-specific compatibility.
- Update examples or docs when provider setup or public usage changes.
