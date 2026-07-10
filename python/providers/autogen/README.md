# composio-autogen

Adapts Composio tools to AutoGen `FunctionTool` objects and registers them with your caller and executor agents, so your AutoGen agents can take action across 1000+ apps.

## Installation

```bash
pip install composio composio-autogen autogen-agentchat
```

Set `COMPOSIO_API_KEY` (from the [dashboard](https://dashboard.composio.dev/settings)) and `OPENAI_API_KEY` in your environment.

## Quickstart

```python
from autogen import AssistantAgent, UserProxyAgent
from composio import Composio
from composio_autogen import AutogenProvider

composio = Composio(provider=AutogenProvider())

# Each session is scoped to one of your users
session = composio.create(user_id="user_123")
tools = session.tools()

chatbot = AssistantAgent(
    "chatbot",
    system_message="Reply TERMINATE when the task is done or when user's content is empty",
    llm_config={"config_list": [{"model": "gpt-5.2"}]},
)

user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=lambda msg: "TERMINATE" in (msg.get("content", "") or ""),
    human_input_mode="NEVER",
    code_execution_config={"use_docker": False},
)

# Register tools with both agents
composio.provider.register_tools(caller=chatbot, executor=user_proxy, tools=tools)

response = user_proxy.initiate_chat(
    chatbot,
    message="Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'",
)

print(response.chat_history)
```

For multi-turn use, store `session.session_id` and reuse it with `composio.use(session_id)` instead of calling `create()` again.

## Provider specifics

AutoGen needs tools registered with two agents, not passed once. Call `composio.provider.register_tools(caller=..., executor=..., tools=tools)`: the `caller` decides which tool to invoke, and the `executor` runs it. This method is unique to the AutoGen provider.

AutoGen caps function names at 64 characters, so the provider hashes and truncates long tool slugs to stay under the limit. The registered name will not always match the original Composio slug.

## Links

- [AutoGen provider docs](https://docs.composio.dev/docs/providers/autogen)
- [Composio documentation](https://docs.composio.dev)
