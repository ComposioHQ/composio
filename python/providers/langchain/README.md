# composio-langchain

Adapts Composio tools to LangChain's `StructuredTool` format so a LangChain agent can call 1000+ apps through a single Composio session.

## Installation

```bash
pip install composio composio-langchain langchain langchain-openai
```

Set `COMPOSIO_API_KEY` (get one from [dashboard.composio.dev/settings](https://dashboard.composio.dev/settings)) and `OPENAI_API_KEY` in your environment:

```bash
export COMPOSIO_API_KEY=xxxxxxxxx
export OPENAI_API_KEY=xxxxxxxxx
```

## Quickstart

Create a session for your user, fetch its tools, and hand them to `create_agent`. LangChain runs the tool loop; each tool executes itself through Composio.

```python
from composio import Composio
from composio_langchain import LangchainProvider
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

composio = Composio(provider=LangchainProvider())
llm = ChatOpenAI(model="gpt-5.2")

# Each session is scoped to one of your users
session = composio.create(user_id="user_123")
tools = session.tools()

agent = create_agent(tools=tools, model=llm)
result = agent.invoke(
    {
        "messages": [
            (
                "user",
                "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'",
            )
        ]
    }
)

print(result["messages"][-1].content)
```

## Error handling

Each wrapped tool builds its `args_schema` from the Composio tool's input schema. When argument validation fails, the tool does not raise; it returns a structured result:

```python
{"successful": False, "error": "<validation message>", "data": None}
```

Check `successful` in tool output instead of wrapping calls in `try`/`except`.

## Links

- [LangChain provider docs](https://docs.composio.dev/docs/providers/langchain)
- [Composio documentation](https://docs.composio.dev)
