# Composio Integration for OpenAI Agents

This package integrates the OpenAI Agents framework with Composio, allowing you to use Composio's rich set of tools with the OpenAI Agents framework.

## Installation

```bash
pip install composio composio-openai-agents openai-agents
```

## Usage

```python
import asyncio

import dotenv
from agents import Agent, Runner

from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider

# Load environment variables from .env
dotenv.load_dotenv()

# Initialize Composio with the OpenAI Agents provider
composio = Composio(provider=OpenAIAgentsProvider())

# Get all the tools
tools = composio.tools.get(
    user_id="default",
    tools=["GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"],
)

# Create an agent with the tools
agent = Agent(
    name="GitHub Agent",
    instructions="You are a helpful assistant that helps users with GitHub tasks.",
    tools=tools,
)


# Run the agent
async def main():
    result = await Runner.run(
        starting_agent=agent,
        input="Star the repository composiohq/composio on GitHub",
    )
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

- Python 3.10+
- OpenAI Agents framework
- Composio (with valid API key)

## License

Apache 2.0
