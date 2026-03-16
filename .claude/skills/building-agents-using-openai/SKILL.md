# Building Agents using OpenAI with Composio

Build AI agents using OpenAI's APIs with Composio tools.

## Installation

```bash
npm install @composio/core @composio/openai openai
npm install @composio/openai-agents @openai/agents  # For Agents API
```

```bash
pip install composio-openai
```

**Find Latest Versions:**
```bash
npm view openai version
pip index versions openai | grep "Available versions" | head -1
```

## Integration Method

**OpenAI is a non-agentic provider** - uses direct tools (no Tool Router support).

### Chat Completions API

```typescript
import { Composio } from '@composio/core';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// Get tools
const tools = await composio.tools.get('default', { toolkits: ['github'] });

// Use with OpenAI
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Create a GitHub issue' }],
  tools: tools,
});

// Handle tool calls
if (response.choices[0].message.tool_calls) {
  const result = await composio.provider.handleToolCalls('default', response);
}
```

```python
from composio_openai import ComposioToolSet, Action
from openai import OpenAI

openai_client = OpenAI(api_key="YOUR_KEY")
composio_toolset = ComposioToolSet(api_key="YOUR_KEY")

# Get tools
tools = composio_toolset.get_tools(actions=[Action.GITHUB_CREATE_ISSUE])

# Use with OpenAI
response = openai_client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Create a GitHub issue"}],
    tools=tools,
)

# Handle tool calls
result = composio_toolset.handle_tool_calls(response)
```

### OpenAI Agents API (Agentic - Requires Tool Router)

```typescript
import { Composio } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { Agent, run } from '@openai/agents';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIAgentsProvider()
});

async function createAgent(userId: string) {
  // Create session for user
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true
  });

  const tools = await session.tools();

  const agent = new Agent({
    name: 'GitHub Agent',
    model: 'gpt-4o',
    instructions: 'You help with GitHub operations',
    tools
  });

  return agent;
}

const agent = await createAgent('user_123');
const result = await run(agent, 'Create a GitHub issue');
```

## Key Resources

- **OpenAI Docs**: https://platform.openai.com/docs
- **Function Calling**: https://platform.openai.com/docs/guides/function-calling
- **Agents API**: https://platform.openai.com/docs/agents
- **OpenAI Agents SDK (Agentic)**: Use Tool Router with `@composio/openai-agents`

## Environment Variables

```bash
OPENAI_API_KEY=sk-...
COMPOSIO_API_KEY=...
```

## Next Steps

1. For Agents API (agentic), use `/building-agents`
2. Check `ts/examples/openai/` for complete examples
3. See [OpenAI docs](https://platform.openai.com/docs) for API features
