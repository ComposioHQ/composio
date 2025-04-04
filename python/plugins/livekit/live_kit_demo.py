import dotenv
from composio_livekit import Action, ComposioToolSet
from livekit import agents
from livekit.agents.voice import Agent, AgentSession, room_io
from livekit.plugins import (
    cartesia,
    deepgram,
    noise_cancellation,
    openai,
    silero,
    turn_detector,
)


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize Composio toolset
composio_toolset = ComposioToolSet()

# Get tools for GitHub star action
tools = composio_toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="You are a helpful voice AI assistant.", tools=tools
        )


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()

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
        room_input_options=room_io.RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    # Initial agent response
    await session.generate_reply()


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
