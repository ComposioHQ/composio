# Composio Integration for LiveKit Agents

This package integrates the LiveKit Agents SDK with Composio, allowing you to use Composio's rich set of tools with LiveKit voice agents.

## Installation

```bash
pip install composio_livekit
```

## Usage

```python
import asyncio
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, AgentServer, JobContext, cli

from composio import Composio
from composio_livekit import LivekitProvider

load_dotenv(".env.local")

# Initialize Composio with LiveKit provider
composio = Composio(provider=LivekitProvider())

# Get Composio tools wrapped for LiveKit
tools = composio.tools.get(
    user_id="default",
    slug=["GMAIL_SEND_EMAIL", "SLACK_POST_MESSAGE"]
)


class Assistant(Agent):
    def __init__(self):
        super().__init__(
            instructions="You are a helpful voice AI assistant with access to email and messaging tools.",
            tools=tools,
        )


server = AgentServer()


@server.rtc_session()
async def my_agent(ctx: JobContext):
    session = AgentSession(
        llm="openai/gpt-4.1-mini",
        stt="assemblyai/universal-streaming:en",
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    )

    await session.start(
        agent=Assistant(),
        room=ctx.room,
    )

    await session.generate_reply(
        instructions="Greet the user and offer your assistance."
    )


if __name__ == "__main__":
    cli.run_app(server)
```

## Features

- Seamlessly integrate Composio's tools with LiveKit Agents
- Access hundreds of pre-built API integrations
- Use tools in voice AI agents with natural language
- Full support for LiveKit's function calling system
- Proper type annotations that work with mypy and pylance

## Requirements

- Python 3.10+
- LiveKit Agents SDK 1.0+
- Composio (with valid API key)

## Environment Variables

Make sure to set the following environment variables:

```bash
# Composio
COMPOSIO_API_KEY=your_composio_api_key

# LiveKit
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://your-project.livekit.cloud

# LLM Provider (e.g., OpenAI)
OPENAI_API_KEY=your_openai_api_key
```

## License

Apache 2.0
