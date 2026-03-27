# Building Agents using LlamaIndex with Composio

Build RAG-enhanced AI agents using LlamaIndex with Composio Tool Router.

## Installation

```bash
npm install @composio/core @composio/llamaindex llamaindex
```

```bash
pip install composio-llamaindex llama-index llama-index-llms-openai
```

**Find Latest Versions:**
```bash
npm view llamaindex version
pip index versions llama-index | grep "Available versions" | head -1
```

## Integration Method

**LlamaIndex is an agentic provider** - use Tool Router for user isolation.

### Python Example with Tool Router

```python
from llama_index.core.agent import ReActAgent
from llama_index.llms.openai import OpenAI
from composio_llamaindex import ComposioToolSet, App

toolset = ComposioToolSet()

def create_agent(user_id: str):
    # Create session
    session = toolset.create(
        user_id=user_id,
        toolkits=["github"],
        manage_connections=True
    )

    tools = session.tools()

    # Create agent
    llm = OpenAI(model="gpt-4o")
    agent = ReActAgent.from_tools(tools, llm=llm, verbose=True)

    return agent

agent = create_agent("user_123")
response = agent.chat("Create a GitHub issue titled 'Bug Report'")
print(response)
```

### TypeScript Example with Tool Router

```typescript
import { Composio } from '@composio/core';
import { LlamaIndexProvider } from '@composio/llamaindex';
import { OpenAI, FunctionCallingAgent } from 'llamaindex';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LlamaIndexProvider(),
});

async function createAgent(userId: string) {
  // Create session
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true
  });

  const tools = await session.tools();

  // Create agent
  const llm = new OpenAI({ model: 'gpt-4o' });
  const agent = new FunctionCallingAgent({
    llm,
    tools,
    verbose: true,
  });

  return agent;
}

const agent = await createAgent('user_123');
const response = await agent.chat({ message: 'Create a GitHub issue' });
```

### MCP Integration

```python
# LlamaIndex also supports MCP for framework flexibility
from composio import Composio

composio = Composio()
session = composio.create(user_id="user_123", toolkits=["github"])

# Use session.mcp.url with LlamaIndex MCP adapters
```

## Key Features

- **ReAct Agents**: Reasoning + Acting pattern
- **RAG + Tools**: Combine retrieval with actions
- **Workflows 1.0**: Event-driven orchestration
- **Query Engines**: Tools for advanced RAG

## Key Resources

- **LlamaIndex Docs**: https://developers.llamaindex.ai/python/framework/
- **Tool Router Guide**: `/building-agents`
- **Agents Guide**: https://developers.llamaindex.ai/python/framework/use_cases/agents/
- **Workflows**: https://www.llamaindex.ai/blog/announcing-workflows-1-0-a-lightweight-framework-for-agentic-systems

## Environment Variables

```bash
OPENAI_API_KEY=sk-...
COMPOSIO_API_KEY=...
```

## Next Steps

1. Use `/building-agents` for comprehensive guide
2. Check `ts/examples/llamaindex/` for complete examples
3. See [LlamaIndex docs](https://developers.llamaindex.ai/) for RAG patterns
