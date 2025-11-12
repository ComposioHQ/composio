from composio_openai_agents import OpenAIAgentsProvider
from composio import Composio
from agents import Agent, Runner
import asyncio

composio = Composio(provider=OpenAIAgentsProvider())
session = composio.tool_router.create(user_id="user_123")

agent = Agent(
    model="gpt-4o-mini",
    name="Assistant",
    instructions="You are a helpful assistant that can access Gmail and GitHub.",
    tools=session.tools(),
)


async def main():
    result_streaming = Runner.run_streamed(agent, "Fetch the latest email from Gmail")
    async for event in result_streaming.stream_events():
        if event.type == "raw_response_event" and hasattr(event.data, "delta"):
            # Print text deltas as they arrive
            print(event.data.delta, end="", flush=True)


asyncio.run(main())
