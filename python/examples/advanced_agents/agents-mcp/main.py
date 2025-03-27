import asyncio
import os
import shutil
import subprocess
import time
from typing import Any

from agents import Agent, Runner, gen_trace_id, trace
from agents.mcp import MCPServer, MCPServerSse
from agents.model_settings import ModelSettings
from dotenv import load_dotenv
from agents import enable_verbose_stdout_logging
from aioconsole import ainput, aprint

load_dotenv()

async def run(mcp_server_1: MCPServer, mcp_server_2: MCPServer):

    # Create new agent for news research
    search_agent = Agent(
        name="Search Assistant",
        instructions="Use the Search news search MCP action to research and collate latest news.",
        mcp_servers=[mcp_server_2],
        model='gpt-4o',
    )

    message = "Research latest news using Search news search MCP action, related to Open Source AI and Closed Source AI, and collate it to send it as morning brief in non markdown format to the user on their slack general channel."
    #print(f"\n\nRunning: {message}")
    search_result = await Runner.run(starting_agent=search_agent, input=message)
    #print(search_result.final_output)

    # Create new agent for sending message to channel
    message_agent = Agent(
        name="Message Assistant",
        instructions="Use Slack tools to send messages to channels.",
        mcp_servers=[mcp_server_1],
        model='gpt-4o',
    )

    message = f"This is the news collated by the agent: {search_result.final_output}, Send it to the user's #ai-news-updates channel, add @here in the beginning of the message"
    final_result = await Runner.run(starting_agent=message_agent, input=message)
    print(final_result.final_output)



async def main():
    trace_id = gen_trace_id()
    with trace(workflow_name="SSE Example", trace_id=trace_id):
        print(f"View trace: https://platform.openai.com/traces/{trace_id}\n")
        async with MCPServerSse(
            name="Search",
            params={
                "url": "https://mcp.composio.dev/composio_search/ambitious-able-wire-8gBOk3",
            },
        ) as server_2, MCPServerSse(
            name="Slack",
            params={
                "url":"https://mcp.composio.dev/slack/ambitious-able-wire-8gBOk3"
            }
        ) as server_1:
            slack_agent = Agent(
                name="Slack Assistant",
                instructions="Use the tools to initiate connection with Slack.",
                mcp_servers=[server_1],
                model='gpt-4o',
            )

            message = "Initiate connection with Slack"
            print(f"Running: {message}")
            result = await Runner.run(starting_agent=slack_agent, input=message)
            print("Connection Url: ",result.final_output)
            connection_status = await ainput('Are you connected (yes or no)? ')
            if connection_status=='yes':
                await run(server_1, server_2)
            else:
                print("Try again")

if __name__ == "__main__":
    if not shutil.which("uv"):
        raise RuntimeError(
            "uv is not installed. Please install it: https://docs.astral.sh/uv/getting-started/installation/"
        )
    
    asyncio.run(main()) 
