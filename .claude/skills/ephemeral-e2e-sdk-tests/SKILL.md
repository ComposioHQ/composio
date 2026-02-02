# Ephemeral E2E SDK Tests

Quick ephemeral verification tests for Composio SDK with AI frameworks. Never commit these tests.

## Important Distinction

- **Ephemeral tests** (this skill): Quick verification in `.agent_cache/test-<usecase>` - never committed
- **Actual E2E tests that run in CI**: Use `ts/e2e-tests/` - committed to repository

## Quick Setup

```bash
# Use descriptive usecase names (e.g., openai-direct-tools, vercel-tool-router, anthropic-mcp)
TEST_DIR=".agent_cache/test-<usecase>"
mkdir -p "$TEST_DIR" && cd "$TEST_DIR"
npm init -y
npm install @composio/core  # Add framework-specific packages as needed
```

## What to Test

- **Direct Tools (Non-Agentic)**: SDK integration with AI frameworks without Tool Router
- **Tool Router (Agentic)**: User-isolated sessions with Tool Router
- **MCP Integration**: MCP protocol compatibility
- **Framework Compatibility**: Different AI frameworks (OpenAI, Vercel, Anthropic, etc.)

## Implementation Examples

For implementation examples, refer to existing skills:

- **Tool Router basics**: Read `building-agents` skill
- **OpenAI integration**: Read `building-agents-using-openai` skill
- **Vercel AI SDK**: Read `building-agents-using-vercel` skill
- **Anthropic**: Read `building-agents-using-anthropic` skill
- **LangChain**: Read `building-agents-using-langchain` skill
- **Other frameworks**: Check respective `building-agents-using-*` skills

## Clean Up

```bash
cd .. && rm -rf "$TEST_DIR"
```

## Best Practices

- **Always use .agent_cache** - These are ephemeral, never commit
- **For CI E2E tests** - Use `ts/e2e-tests/` instead (see `ts/e2e-tests/README.md`)
- **Use non-auth apps** - HackerNews, Public APIs for quick testing
- **Report critical issues** - Add proper test cases to `ts/e2e-tests/` if needed
