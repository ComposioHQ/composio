# composio-google-adk

Adapts Composio tools to [Google ADK](https://google.github.io/adk-docs/) `FunctionTool` objects, so your ADK agents can take action across 1000+ apps.

## Installation

```bash
pip install composio composio-google-adk google-adk
```

Set `COMPOSIO_API_KEY` (from the [dashboard](https://dashboard.composio.dev/settings)) and `GOOGLE_API_KEY` in your environment.

## Quickstart

```python
from composio import Composio
from composio_google_adk import GoogleAdkProvider
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

composio = Composio(provider=GoogleAdkProvider())

# Each Composio session is scoped to one of your users
composio_session = composio.create(user_id="user_123")
tools = composio_session.tools()

agent = Agent(
    name="personal_assistant",
    model="gemini-2.0-flash",
    instruction="You are a helpful assistant. Use Composio tools to take action.",
    tools=tools,
)

session_service = InMemorySessionService()
session_service.create_session_sync(
    app_name="personal_assistant",
    user_id="user_123",
    session_id="1234",
)
runner = Runner(
    agent=agent,
    app_name="personal_assistant",
    session_service=session_service,
)

events = runner.run(
    user_id="user_123",
    session_id="1234",
    new_message=types.Content(
        role="user",
        parts=[types.Part(text="Star the repository composiohq/composio on GitHub")],
    ),
)
for event in events:
    if event.is_final_response() and event.content and event.content.parts:
        print(event.content.parts[0].text)
```

For multi-turn use, store `composio_session.session_id` and reuse it with `composio.use(session_id)` instead of calling `create()` again.

## How tools are wrapped

`GoogleAdkProvider` turns each Composio tool into a `google.adk.tools.FunctionTool` with a Python signature and docstring generated from the tool's schema, so ADK can pass them to Gemini as regular function declarations.

## Links

- [Quickstart](https://docs.composio.dev/docs/quickstart)
- [Composio documentation](https://docs.composio.dev)
