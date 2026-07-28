# composio-openai-agents

Adapts Composio tools to the [OpenAI Agents](https://github.com/openai/openai-agents-python) framework's native tool format, so your agents can take action across 1000+ apps.

## Installation

```bash
pip install composio composio-openai-agents openai-agents
```

Set `COMPOSIO_API_KEY` (from the [dashboard](https://dashboard.composio.dev/settings)) and `OPENAI_API_KEY` in your environment.

## Quickstart

```python
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from agents import Agent, Runner

composio = Composio(provider=OpenAIAgentsProvider())

# Each session is scoped to one of your users
session = composio.create(user_id="user_123")
tools = session.tools()

agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful assistant. Use Composio tools to take action.",
    tools=tools,
)

result = Runner.run_sync(starting_agent=agent, input="Summarize my emails from today")
print(result.final_output)
```

By default a session gets meta tools that discover, authenticate, and execute app tools at runtime. For multi-turn use, store `session.session_id` and reuse it with `composio.use(session_id)` instead of calling `create()` again.

## Links

- [Quickstart](https://docs.composio.dev/docs/quickstart)
- [Composio documentation](https://docs.composio.dev)
