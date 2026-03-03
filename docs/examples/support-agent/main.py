# region setup
import asyncio

from agents import Agent, Runner
from agents.stream_events import RawResponsesStreamEvent
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from openai.types.responses import ResponseTextDeltaEvent

composio = Composio(provider=OpenAIAgentsProvider())
# endregion setup


# region agent
SYSTEM_PROMPT = """You are a Support Knowledge Agent. Use your tools to help the user triage issues, find documentation, and manage incidents. Call tools first, then respond with what you found. Be concise."""


def create_agent(tools) -> Agent:
    return Agent(
        name="Support Knowledge Agent",
        model="gpt-5.2",
        instructions=SYSTEM_PROMPT,
        tools=tools,
    )
# endregion agent


# region chat
async def main():
    user_id = "default"
    session = composio.create(
        user_id=user_id,
        toolkits=["datadog", "notion", "github"],
    )
    tools = session.tools()
    agent = create_agent(tools)

    messages = []
    print("Support Knowledge Agent (type 'quit' to exit)")
    print("-" * 50)

    while True:
        user_input = input("\nYou: ").strip()
        if not user_input or user_input.lower() == "quit":
            break

        messages.append({"role": "user", "content": user_input})

        print("\nAgent: ", end="", flush=True)
        result = Runner.run_streamed(starting_agent=agent, input=messages, max_turns=30)
        async for event in result.stream_events():
            if isinstance(event, RawResponsesStreamEvent) and isinstance(event.data, ResponseTextDeltaEvent):
                print(event.data.delta, end="", flush=True)
        print()

        messages.append({"role": "assistant", "content": result.final_output})


asyncio.run(main())
# endregion chat
