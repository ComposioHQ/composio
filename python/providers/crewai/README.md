# composio-crewai

Adapts Composio tools to CrewAI's `BaseTool` format so your crew's agents can act across 1000+ apps through a single Composio session.

## Installation

```bash
pip install composio composio-crewai crewai
```

Set `COMPOSIO_API_KEY` (get one from [dashboard.composio.dev/settings](https://dashboard.composio.dev/settings)) and `OPENAI_API_KEY` in your environment:

```bash
export COMPOSIO_API_KEY=xxxxxxxxx
export OPENAI_API_KEY=xxxxxxxxx
```

## Quickstart

Create a session for your user, fetch its tools, and pass them to an `Agent`. CrewAI runs the task end to end; each tool executes itself through Composio.

```python
from crewai import Agent, Crew, Task
from composio import Composio
from composio_crewai import CrewAIProvider

composio = Composio(provider=CrewAIProvider())

# Each session is scoped to one of your users
session = composio.create(user_id="user_123")
tools = session.tools()

agent = Agent(
    role="Email Agent",
    goal="Send emails on behalf of the user",
    backstory="You are an AI agent that sends emails using Gmail.",
    tools=tools,
    llm="gpt-5.2",
)

task = Task(
    description="Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'",
    agent=agent,
    expected_output="Confirmation that the email was sent",
)

crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
print(result)
```

## Error handling

Each Composio tool becomes a CrewAI `BaseTool` whose `args_schema` is built from the tool's input schema, so CrewAI validates arguments before running anything. When validation fails, the tool does not raise; it returns a structured result:

```python
{"successful": False, "error": "<validation message>", "data": None}
```

Check `successful` in your task output instead of wrapping calls in `try`/`except`.

## Links

- [CrewAI provider docs](https://docs.composio.dev/docs/providers/crewai)
- [Composio documentation](https://docs.composio.dev)
