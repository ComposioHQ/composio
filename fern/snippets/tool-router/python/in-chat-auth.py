import asyncio
from composio import Composio
from agents import Agent, Runner, HostedMCPTool

composio = Composio()

async def chat():
    session = await composio.create_session(
        user="pg-user-550e8400-e29b-41d4",
    )

    agent = Agent(
        name="GitHub Assistant",
        instructions="Help users with their GitHub repositories.",
        tools=[
            HostedMCPTool(
                tool_config={
                    "type": "mcp",
                    "server_label": "composio",
                    "server_url": session.mcp.url,
                    "require_approval": "never",
                }
            )
        ],
    )

    print("Chat with your agent. Type 'exit' to quit.\n")

    while True:
        user_input = input("You: ")
        if user_input.lower() == "exit":
            break

        result = await Runner.run(
            agent,
            user_input,
        )

        print(f"Agent: {result.final_output}\n")

asyncio.run(chat())
