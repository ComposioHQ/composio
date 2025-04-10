# Composio Integration for LiveKit

This package integrates LiveKit with Composio, allowing you to use Composio's powerful toolset within LiveKit's agent framework.

## Installation

```bash
pip install composio_livekit
```

## Requirements

- Python 3.9 or higher
- composio_core >= 0.7.0
- livekit >= 0.14.0
- pydantic >= 2.0.0

## Usage

### Basic Integration

```python
from composio_livekit import ComposioToolSet, Action
from livekit.agents.voice import Agent

# Initialize the toolset
composio_toolset = ComposioToolSet()

# Get specific tools
tools = composio_toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

# Use with LiveKit Agent
class Assistant(Agent):
    def __init__(self):
        super().__init__(
            instructions="You are a helpful voice AI assistant.",
            tools=tools
        )
```

### Complete Example

For a complete example including voice integration, see the demo file in the repository:

```python
from livekit.agents.voice import AgentSession
from livekit.plugins import (
    openai,
    cartesia,
    deepgram,
    silero,
    turn_detector,
)

async def setup_agent_session():
    session = AgentSession(
        stt=deepgram.STT(),
        llm=openai.LLM(model="gpt-4o"),
        tts=cartesia.TTS(),
        vad=silero.VAD.load(),
        turn_detection=turn_detector.EOUModel(),
    )
    
    await session.start(
        room=ctx.room,
        agent=Assistant(),
    )
```

## Features

- Seamless integration between Composio tools and LiveKit agents
- Support for all Composio actions and apps
- Type-safe function signatures
- Proper handling of array parameters and complex types

## License

Apache License 2.0