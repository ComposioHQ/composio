# Building Agents using LangChain with Composio

Build AI agents using LangChain/LangGraph with Composio Tool Router.

## Installation

```bash
npm install @composio/core @composio/langchain langchain @langchain/core @langchain/openai
```

```bash
pip install composio-langchain langchain langchain-openai
```

**Find Latest Versions:**
```bash
npm view langchain version
pip index versions langchain | grep "Available versions" | head -1
```

## Integration Method

**LangChain is an agentic provider** - use Tool Router (or MCP for flexibility).

### Native Tools with Tool Router

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { Composio } from '@composio/core';
import { LangchainProvider } from '@composio/langchain';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LangchainProvider(),
});

async function runAgent(userId: string, prompt: string) {
  // Create session
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true
  });

  const tools = await session.tools();

  // Use with LangChain
  const llm = new ChatOpenAI({ model: 'gpt-4o' });
  const agent = llm.bindTools(tools);

  const result = await agent.invoke(prompt);
  return result;
}
```

```python
from langchain_openai import ChatOpenAI
from composio_langchain import ComposioToolSet, App

composio_toolset = ComposioToolSet()

def run_agent(user_id: str, prompt: str):
    # Create session
    session = composio_toolset.create(
        user_id=user_id,
        toolkits=["github"],
        manage_connections=True
    )

    tools = session.tools()

    # Use with LangChain
    llm = ChatOpenAI(model="gpt-4o")
    agent = llm.bind_tools(tools)

    result = agent.invoke(prompt)
    return result
```

### MCP Integration

```typescript
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { Composio } from '@composio/core';

const composio = new Composio();

async function runAgentMCP(userId: string) {
  const session = await composio.create(userId, {
    toolkits: ['github']
  });

  const client = new MultiServerMCPClient({
    composio: {
      transport: 'http',
      url: session.mcp.url,
      headers: session.mcp.headers
    }
  });

  const tools = await client.getTools();
  // Use tools with LangChain
}
```

## Key Resources

- **LangChain Docs**: https://python.langchain.com/docs/introduction/
- **Tool Router Guide**: `/building-agents`
- **Agents Documentation**: https://docs.langchain.com/oss/python/langchain/agents
- **Use LangGraph for production**: More flexible agent runtime

## Environment Variables

```bash
OPENAI_API_KEY=sk-...  # Or other LLM provider
COMPOSIO_API_KEY=...
```

## Next Steps

1. Use `/building-agents` for comprehensive guide
2. Use `/building-agents-using-langgraph` for stateful agents
3. Check `ts/examples/langchain/` for complete examples
