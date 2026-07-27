# composio-llamaindex

Adapts Composio tools to LlamaIndex's `FunctionTool` format so a LlamaIndex agent can call 1000+ apps through a single Composio session.

## Installation

```bash
pip install composio composio-llamaindex llama-index llama-index-llms-openai
```

Set `COMPOSIO_API_KEY` (get one from [dashboard.composio.dev/settings](https://dashboard.composio.dev/settings)) and `OPENAI_API_KEY` in your environment:

```bash
export COMPOSIO_API_KEY=xxxxxxxxx
export OPENAI_API_KEY=xxxxxxxxx
```

## Quickstart

Create a session for your user, fetch its tools, and hand them to a `FunctionAgent`. LlamaIndex drives the tool calls; each tool executes itself through Composio.

```python
import asyncio

from composio import Composio
from composio_llamaindex import LlamaIndexProvider
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai import OpenAI

composio = Composio(provider=LlamaIndexProvider())
llm = OpenAI(model="gpt-5.2")

# Each session is scoped to one of your users
session = composio.create(user_id="user_123")
tools = session.tools()

agent = FunctionAgent(tools=tools, llm=llm)


async def main():
    result = await agent.run(
        user_msg="Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'"
    )
    print(result)


asyncio.run(main())
```

## Links

- [LlamaIndex provider docs](https://docs.composio.dev/docs/providers/llamaindex)
- [Composio documentation](https://docs.composio.dev)
