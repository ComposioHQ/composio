# Building Agents using Microsoft AutoGen with Composio

Build multi-agent conversational systems using AutoGen with Composio Tool Router.

## Installation

```bash
# For AgentChat (conversational agents)
pip install composio-autogen autogen-agentchat autogen-ext[openai]

# For AutoGen Studio (UI-based)
pip install autogenstudio
```

**Find Latest Versions:**
```bash
pip index versions autogen-agentchat | grep "Available versions" | head -1
pip index versions composio-autogen | grep "Available versions" | head -1
```

## Integration Method

**AutoGen is an agentic provider** - use Tool Router for user isolation.

### Native Tools with Tool Router

```python
import asyncio
from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient
from composio_autogen import ComposioToolSet, App

toolset = ComposioToolSet()

async def create_agent(user_id: str):
    # Create session
    session = toolset.create(
        user_id=user_id,
        toolkits=["github"],
        manage_connections=True
    )

    tools = session.tools()

    # Create agent with tools
    agent = AssistantAgent(
        name="github_agent",
        model_client=OpenAIChatCompletionClient(model="gpt-4o"),
        tools=tools,
        system_message="You manage GitHub repositories"
    )

    return agent

async def main():
    agent = await create_agent("user_123")
    result = await agent.run(task="Create a GitHub issue titled 'Bug Report'")
    print(result)

asyncio.run(main())
```

### Multi-Agent Conversation

```python
import asyncio
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_ext.models.openai import OpenAIChatCompletionClient
from composio_autogen import ComposioToolSet, App

toolset = ComposioToolSet()

async def create_team(user_id: str):
    # Create session
    session = toolset.create(
        user_id=user_id,
        toolkits=["github", "slack"],
        manage_connections=True
    )

    tools = session.tools()

    # Create specialized agents
    github_agent = AssistantAgent(
        name="github_agent",
        model_client=OpenAIChatCompletionClient(model="gpt-4o"),
        tools=tools,
        system_message="You manage GitHub"
    )

    slack_agent = AssistantAgent(
        name="slack_agent",
        model_client=OpenAIChatCompletionClient(model="gpt-4o"),
        tools=tools,
        system_message="You manage Slack"
    )

    # Create team
    team = RoundRobinGroupChat(
        [github_agent, slack_agent],
        max_turns=10
    )

    return team

async def main():
    team = await create_team("user_123")
    result = await team.run(
        task="Create a GitHub issue and notify team on Slack"
    )
    print(result)

asyncio.run(main())
```

## Key Features

- **Multi-Agent Conversations**: Agents collaborate and communicate
- **AutoGen Studio**: No-code UI for prototyping
- **Multiple Layers**: Studio, AgentChat, Core for different needs
- **Team Patterns**: RoundRobin, Swarm, custom orchestration

## Key Resources

- **AutoGen Docs**: https://microsoft.github.io/autogen/stable/
- **Tool Router Guide**: `/building-agents`
- **GitHub**: https://github.com/microsoft/autogen
- **Microsoft Agent Framework**: Successor to AutoGen

## Environment Variables

```bash
OPENAI_API_KEY=sk-...  # Or other LLM provider
COMPOSIO_API_KEY=...
```

## Next Steps

1. Use `/building-agents` for comprehensive guide
2. Check `python/providers/autogen/` for complete examples
3. See [AutoGen docs](https://microsoft.github.io/autogen/stable/) for conversation patterns
4. Consider [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/) for new projects
