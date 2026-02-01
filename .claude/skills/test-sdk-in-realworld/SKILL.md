# Testing Composio SDK in Real-World Scenarios

Test the Composio SDK viability using ephemeral test projects. Never commit these tests.

## Overview

This skill helps validate SDK functionality by creating temporary test projects that:
- Test both agentic (Tool Router) and non-agentic (Direct Tools) approaches
- Use non-auth apps like HackerNews for quick validation
- Identify bugs and quality issues in SDK or providers
- Clean up automatically - never committed to repository

## Testing Approach

### 1. Create Ephemeral Test Project

Always use the .agent_cache directory for tests:
```bash
# Create test directory in .agent_cache (gitignored)
TEST_DIR=".agent_cache/sdk-test-$(date +%s)"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize project
npm init -y
npm install @composio/core openai
```

### 2. Test Non-Agentic Providers (Direct Tools)

Test simple tool execution without Tool Router:

```typescript
// test-direct-tools.ts
import { Composio } from '@composio/core';
import OpenAI from 'openai';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testDirectTools() {
  // Get HackerNews tools (no auth required)
  const tools = await composio.tools.get('default', {
    toolkits: ['hackernews']
  });

  console.log(`✓ Got ${tools.length} HackerNews tools`);

  // Test with OpenAI
  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [{ role: 'user', content: 'Get top 5 HackerNews stories' }],
    tools: tools,
  });

  // Handle tool calls
  if (response.choices[0].message.tool_calls) {
    const result = await composio.provider.handleToolCalls('default', response);
    console.log('✓ Tool execution successful');
    return result;
  }
}

testDirectTools().catch(console.error);
```

### 3. Test Agentic Providers (Tool Router)

Test user-isolated sessions with Tool Router:

```typescript
// test-tool-router.ts
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

async function testToolRouter() {
  // Create session for test user
  const session = await composio.create('test-user-001', {
    toolkits: ['hackernews'],
    manageConnections: false, // Non-auth app
  });

  console.log('✓ Created Tool Router session');

  const tools = await session.tools();
  console.log(`✓ Got ${Object.keys(tools).length} tools from session`);

  // Test with Vercel AI SDK
  const result = await generateText({
    model: openai('gpt-5.2'),
    prompt: 'Get the top 3 HackerNews stories',
    tools,
    maxSteps: 5,
  });

  console.log('✓ Tool Router execution successful');
  return result.text;
}

testToolRouter().catch(console.error);
```

### 4. Test MCP Integration

Test MCP protocol compatibility:

```typescript
// test-mcp.ts
import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

async function testMCP() {
  const session = await composio.create('test-user-mcp', {
    toolkits: ['hackernews'],
    manageConnections: false,
  });

  console.log('✓ MCP Session created');
  console.log('  URL:', session.mcp.url);
  console.log('  Headers:', Object.keys(session.mcp.headers));

  // Test MCP endpoint accessibility
  const response = await fetch(session.mcp.url + '/tools', {
    headers: session.mcp.headers,
  });

  console.log('✓ MCP endpoint accessible:', response.ok);
  return response.ok;
}

testMCP().catch(console.error);
```

## Running Tests

```bash
# Run direct tools test
npx tsx test-direct-tools.ts

# Run Tool Router test
npm install @composio/vercel ai @ai-sdk/openai
npx tsx test-tool-router.ts

# Run MCP test
npx tsx test-mcp.ts

# Clean up (always run after testing)
cd .. && rm -rf "$TEST_DIR"
```

## What to Test

1. **Installation**: Does `npm install @composio/core` work?
2. **Type Safety**: Are TypeScript types correct?
3. **Tool Discovery**: Can we fetch tools from toolkits?
4. **Tool Execution**: Do tools execute successfully?
5. **Error Handling**: Are errors informative?
6. **Session Management**: Does Tool Router create sessions?
7. **MCP Protocol**: Is MCP endpoint accessible?
8. **Provider Integration**: Do provider packages work?

## Reporting Issues

When you find bugs or quality issues:

1. **SDK Core Issues**: Report in GitHub Issues with:
   - Minimal reproduction code
   - Expected vs actual behavior
   - SDK version and environment

2. **Provider Issues**: Note which provider package has issues

3. **Documentation Issues**: Flag missing or incorrect docs

## Best Practices

- **Always use .agent_cache**: Never create tests in the main repository
- **Use non-auth apps**: HackerNews, Public APIs for quick testing
- **Test incrementally**: Start with simple tools, then complex workflows
- **Clean up**: Always delete test directory after testing
- **Check latest versions**: Use `npm view @composio/core version`

## Available Environment Variables

Assume these are available:
```bash
COMPOSIO_API_KEY    # Composio API key
OPENAI_API_KEY      # OpenAI API key
ANTHROPIC_API_KEY   # Anthropic API key
```

## Quick Test Template

```bash
# One-liner to create and test
TEST_DIR=".agent_cache/sdk-test-$(date +%s)" && \
mkdir -p "$TEST_DIR" && cd "$TEST_DIR" && \
npm init -y && npm install @composio/core openai && \
echo "console.log('SDK Test Ready')" > test.ts && \
npx tsx test.ts && \
cd .. && rm -rf "$TEST_DIR"
```

## Next Steps

1. Read `/building-agents` for comprehensive Tool Router documentation
2. Check provider-specific skills for integration examples
3. Report any bugs found during testing to the team
