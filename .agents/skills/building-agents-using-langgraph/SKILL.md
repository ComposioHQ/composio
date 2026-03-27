# Building Agents using LangGraph with Composio

Build stateful, durable AI agents using LangGraph with Composio Tool Router.

## Installation

```bash
npm install @composio/core @composio/langchain @langchain/langgraph @langchain/core
```

```bash
pip install composio-langchain langgraph langgraph-checkpoint-sqlite
```

**Find Latest Versions:**
```bash
npm view @langchain/langgraph version
pip index versions langgraph | grep "Available versions" | head -1
```

## Integration Method

**LangGraph is an agentic provider** - use Tool Router for user isolation.

### Python Example with Tool Router

```python
from langgraph.graph import StateGraph, MessagesAnnotation, START, END
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_openai import ChatOpenAI
from composio_langchain import ComposioToolSet

toolset = ComposioToolSet()

def create_agent(user_id: str):
    # Create session
    session = toolset.create(
        user_id=user_id,
        toolkits=["github"],
        manage_connections=True
    )

    tools = session.tools()

    # Create graph
    tool_node = ToolNode(tools)
    model = ChatOpenAI(model="gpt-4o").bind_tools(tools)

    def should_continue(state):
        last_message = state["messages"][-1]
        return "tools" if hasattr(last_message, "tool_calls") and last_message.tool_calls else END

    def call_model(state):
        return {"messages": [model.invoke(state["messages"])]}

    workflow = StateGraph(MessagesAnnotation)
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)
    workflow.add_edge(START, "agent")
    workflow.add_edge("tools", "agent")
    workflow.add_conditional_edges("agent", should_continue)

    # Compile with checkpointer for durability
    memory = SqliteSaver.from_conn_string(":memory:")
    app = workflow.compile(checkpointer=memory)

    return app

# Use with thread_id for persistence
app = create_agent("user_123")
result = app.invoke(
    {"messages": [{"role": "user", "content": "Create a GitHub issue"}]},
    config={"configurable": {"thread_id": "user-123"}}
)
```

### TypeScript Example with Tool Router

```typescript
import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { Composio } from '@composio/core';
import { LangchainProvider } from '@composio/langchain';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LangchainProvider(),
});

async function createAgent(userId: string) {
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true
  });

  const tools = await session.tools();
  const toolNode = new ToolNode(tools);
  const model = new ChatOpenAI({ model: 'gpt-4o' }).bindTools(tools);

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', async (state) => ({ messages: [await model.invoke(state.messages)] }))
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addEdge('tools', 'agent')
    .addConditionalEdges('agent', (state) => {
      const last = state.messages[state.messages.length - 1];
      return last.tool_calls?.length ? 'tools' : END;
    });

  return workflow.compile();
}
```

## Key Features

- **Durable Execution**: Agents persist through failures
- **Human-in-the-Loop**: Pause for approvals
- **Persistent Memory**: State saved across sessions
- **Production Ready**: v1.0 released late 2025

## Key Resources

- **LangGraph Docs**: https://docs.langchain.com/oss/python/langgraph/
- **Tool Router Guide**: `/building-agents`
- **LangGraph v1.0**: https://www.blog.langchain.com/langchain-langgraph-1dot0/

## Environment Variables

```bash
OPENAI_API_KEY=sk-...
COMPOSIO_API_KEY=...
```

## Next Steps

1. Use `/building-agents` for comprehensive guide
2. Check `ts/examples/langchain/` for complete examples
3. See [LangGraph docs](https://docs.langchain.com/oss/python/langgraph/) for advanced features
