# Building Agents using Anthropic with Composio

Build AI agents using Anthropic's Claude API with Composio tools.

## Installation

```bash
npm install @composio/core @composio/anthropic @anthropic-ai/sdk
npm install @composio/claude-agent-sdk @anthropic-ai/claude-agent-sdk  # For Agent SDK
```

```bash
pip install composio-anthropic
```

**Find Latest Versions:**
```bash
npm view @anthropic-ai/sdk version
pip index versions anthropic | grep "Available versions" | head -1
```

## Integration Method

**Anthropic Messages API is non-agentic** - uses direct tools. **Claude Agent SDK is agentic** - uses Tool Router.

### Messages API (Non-Agentic)

```typescript
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider({ cacheTools: true }),
});

// Get tools
const tools = await composio.tools.get('default', { toolkits: ['github'] });

// Use with Claude
const message = await anthropic.messages.create({
  model: 'claude-3-7-sonnet-latest',
  max_tokens: 1024,
  tools: tools,
  messages: [{ role: 'user', content: 'Create a GitHub issue' }],
});

// Handle tool calls
const toolResults = await composio.provider.handleToolCalls('default', message);
```

```python
from composio_anthropic import ComposioToolSet, Action
from anthropic import Anthropic

client = Anthropic(api_key="YOUR_KEY")
composio_toolset = ComposioToolSet(api_key="YOUR_KEY")

# Get tools
tools = composio_toolset.get_tools(actions=[Action.GITHUB_CREATE_ISSUE])

# Use with Claude
message = client.messages.create(
    model="claude-3-7-sonnet-latest",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "Create a GitHub issue"}]
)

# Handle tool calls
tool_results = composio_toolset.handle_tool_calls(message)
```

### Claude Agent SDK (Agentic - Requires Tool Router)

```typescript
import { Composio } from '@composio/core';
import { ClaudeAgentSDKProvider } from '@composio/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new ClaudeAgentSDKProvider()
});

async function runAgent(userId: string, prompt: string) {
  // Create session
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true
  });

  const tools = await session.tools();

  // Use with Claude Agent SDK
  const stream = await query({
    prompt,
    options: {
      model: 'claude-sonnet-4-5-20250929',
      permissionMode: 'bypassPermissions',
      tools
    }
  });

  for await (const event of stream) {
    if (event.type === 'result' && event.subtype === 'success') {
      console.log(event.result);
    }
  }
}
```

## Key Resources

- **Anthropic Docs**: https://docs.anthropic.com/
- **Tool Use Guide**: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- **Claude Agent SDK**: https://docs.anthropic.com/en/docs/agents
- **Messages API (Non-Agentic)**: Direct tools
- **Claude Agent SDK (Agentic)**: Use Tool Router

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
COMPOSIO_API_KEY=...
```

## Next Steps

1. For Agent SDK (agentic), use `/building-agents`
2. Check `ts/examples/anthropic/` for complete examples
3. See [Anthropic docs](https://docs.anthropic.com/) for Claude features
