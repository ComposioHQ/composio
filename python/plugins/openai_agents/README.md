# Composio Integration for OpenAI Agents

This package integrates the OpenAI Agents framework with Composio, allowing you to use Composio's rich set of tools with the OpenAI Agents framework.

## Installation

```bash
pip install composio_openai_agents
```

## Usage

```python
import asyncio
import dotenv
from agents import Agent, Runner

from composio_openai_agents import Action, ComposioToolSet

# Load environment variables from .env
dotenv.load_dotenv()

# Initialize Composio toolset
composio_toolset = ComposioToolSet()

# Get all the tools
tools = composio_toolset.get_tools(actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER])

# Create an agent with the tools
agent = Agent(
    name="GitHub Agent",
    instructions="You are a helpful assistant that helps users with GitHub tasks.",
    tools=tools,
)

# Run the agent
async def main():
    result = await Runner.run(agent, "Star the repository composiohq/composio on GitHub")
    print(result.final_output)

asyncio.run(main())
```

## Features

- Seamlessly integrate Composio's tools with OpenAI Agents
- Access hundreds of pre-built API integrations
- Maintain consistent schema formats between frameworks
- Error handling for validation issues
- Proper type annotations that work with mypy and pylance

## Requirements

- Python 3.9+
- OpenAI Agents framework
- Composio (with valid API key)

## License

Apache 2.0