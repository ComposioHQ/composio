# @composio/langchain

The LangChain provider turns Composio tools into LangChain `DynamicStructuredTool` objects with built-in execution, ready for LangChain and LangGraph agents. In TypeScript, LangGraph is served by this same package.

## Installation

```bash
npm install @composio/core @composio/langchain @langchain/core @langchain/openai @langchain/langgraph
```

Set `COMPOSIO_API_KEY` with your API key from [the dashboard](https://dashboard.composio.dev/settings), and `OPENAI_API_KEY` (or your LLM provider's key).

## Quickstart

Create a session for your user, fetch its tools, and wire them into a LangGraph agent:

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { Composio } from '@composio/core';
import { LangchainProvider } from '@composio/langchain';

const composio = new Composio({
  provider: new LangchainProvider(),
});

// Create a session for your user
const session = await composio.sessions.create('user_123');
const tools = await session.tools();

const toolNode = new ToolNode(tools);

const model = new ChatOpenAI({
  model: 'gpt-5.2',
  temperature: 0,
}).bindTools(tools);

function shouldContinue({ messages }: typeof MessagesAnnotation.State) {
  const lastMessage = messages[messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls?.length) {
    return 'tools';
  }
  return '__end__';
}

async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await model.invoke(state.messages);
  return { messages: [response] };
}

const workflow = new StateGraph(MessagesAnnotation)
  .addNode('agent', callModel)
  .addEdge('__start__', 'agent')
  .addNode('tools', toolNode)
  .addEdge('tools', 'agent')
  .addConditionalEdges('agent', shouldContinue);

const app = workflow.compile();

const finalState = await app.invoke({
  messages: [
    new HumanMessage(
      "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'"
    ),
  ],
});
console.log(finalState.messages[finalState.messages.length - 1].content);
```

Each tool is a standard `DynamicStructuredTool`, so it also works anywhere LangChain accepts tools: chains, LCEL pipelines, and `bindTools` on any chat model.

## Links

- [LangChain provider docs](https://docs.composio.dev/docs/providers/langchain)
- [Composio documentation](https://docs.composio.dev)
