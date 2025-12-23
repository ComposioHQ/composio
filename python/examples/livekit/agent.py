"""
LiveKit Voice Agent with Composio Tools

This example demonstrates how to use Composio tools with the LiveKit Agents SDK
to create a voice AI agent that can interact with external services.

Required environment variables:
- LIVEKIT_API_KEY: Your LiveKit API key
- LIVEKIT_API_SECRET: Your LiveKit API secret
- LIVEKIT_URL: Your LiveKit server URL
- COMPOSIO_API_KEY: Your Composio API key (get one at https://app.composio.dev)
- OPENAI_API_KEY: Your OpenAI API key

Usage:
  # Load LiveKit credentials
  lk app env -w -d .env

  # Download model files
  python agent.py download-files

  # Run in development mode
  python agent.py dev

  # Connect to playground: https://agents-playground.livekit.io
"""

import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    inference,
)
from livekit.plugins import silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from composio import Composio

# Add the provider to path for local development
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "providers" / "livekit"))
from composio_livekit import LivekitProvider

logger = logging.getLogger("composio-livekit-agent")

# Load environment variables from .env file
load_dotenv(".env")

# Initialize Composio with LiveKit provider
composio = Composio(provider=LivekitProvider())


def get_composio_tools():
    """
    Get Composio tools wrapped for LiveKit.
    You can customize which tools to fetch based on your use case.
    """
    print("Fetching Composio tools...")
    tools = composio.tools.get(
        user_id="default",
        slug="HACKERNEWS_GET_FRONT_PAGE_POSTS",
    )
    print(f"Loaded {len(tools)} Composio tool(s)")
    return tools


class ComposioAssistant(Agent):
    """
    Voice Agent with Composio tools integration.

    This agent can:
    - Search HackerNews posts
    - Interact with other Composio-supported services
    """

    def __init__(self, tools: list) -> None:
        super().__init__(
            instructions="""You are a helpful voice AI assistant with access to various tools.
            You can help users with tasks like:
            - Searching for posts on HackerNews
            - And more based on the tools available to you.

            Your responses should be concise and conversational since users are interacting via voice.
            Avoid complex formatting, emojis, or long lists in your responses.
            Be friendly, helpful, and to the point.""",
            tools=tools,
        )


server = AgentServer()


def prewarm(proc: JobProcess):
    """Prewarm the VAD model for faster startup."""
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session()
async def my_agent(ctx: JobContext):
    """Main agent session handler."""
    # Get Composio tools
    tools = get_composio_tools()

    # Create the voice agent with Composio tools
    agent = ComposioAssistant(tools)

    # Set up the voice AI session with STT, LLM, and TTS
    session = AgentSession(
        # Speech-to-text: Converts user's voice to text
        stt=inference.STT(model="assemblyai/universal-streaming", language="en"),
        # Large Language Model: Processes input and generates responses
        llm=inference.LLM(model="openai/gpt-4.1-mini"),
        # Text-to-speech: Converts LLM responses to voice
        tts=inference.TTS(
            model="cartesia/sonic-3", voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
        ),
        # Voice Activity Detection and turn detection
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
    )

    # Start the session
    await session.start(
        agent=agent,
        room=ctx.room,
    )

    # Connect to the room
    await ctx.connect()

    # Generate an initial greeting
    session.generate_reply(
        instructions="Greet the user warmly and let them know you can help them search HackerNews or perform other tasks. Ask how you can assist them today."
    )


if __name__ == "__main__":
    cli.run_app(server)
