import asyncio
import os
import shutil
import subprocess
import time
from typing import Any
import pyfiglet
from termcolor import colored

from agents import Agent, ComputerTool, Runner, gen_trace_id, trace
from agents.mcp import MCPServer, MCPServerSse
from agents.model_settings import ModelSettings
from altair import Description
from dotenv import load_dotenv
from agents import enable_verbose_stdout_logging
from aioconsole import ainput, aprint
from computer import LocalPlaywrightComputer as computer

load_dotenv()

def generate_ascii_art(text, font="slant", color="cyan"):
    try:
        ascii_art = pyfiglet.figlet_format(text, font=font)
        return colored(ascii_art, color) # type: ignore
    except pyfiglet.FontNotFound:
        return f"Error: The font '{font}' is not available. Try another font."

async def run(mcp_server_1: MCPServer, mcp_server_2: MCPServer, user_input: str):

    computer_agent = Agent(
        name="Search Assistant",
        instructions="Use the Search news search MCP action to research and collate latest news.",
        tools=[ComputerTool(computer=computer)], # type: ignore
        model='computer-use-preview',
        model_settings=ModelSettings(truncation="auto"),
        
    )

    manus_agent = Agent(
        name="Personal Assistant",
        instructions=f"You are an AI Agent that uses the tools available to it to accomplish the task given to you. Don't send messages in markdown format, send it as just well formatted text.",
        mcp_servers=[mcp_server_1, mcp_server_2],
        tools=[computer_agent.as_tool(tool_name='browser_agent', tool_description='An Agent that uses the browser to perform tasks')], # type: ignore
        model='gpt-4o',
    )
    search_result = await Runner.run(starting_agent=manus_agent, input=f"List all actions you have access to")
    await aprint(search_result.final_output)

    #print(f"\n\nRunning: {message}")
    search_result = await Runner.run(starting_agent=manus_agent, input=f"This is what the user wants you to do:{user_input}, perform the task and send it on Slack #ai-news-updates channel")
    await aprint(search_result.final_output)


async def main():
    # Display ASCII art banner
    text = "Composio MCP + OpenAI Agents SDK"
    ascii_art = generate_ascii_art(text, font="slant", color="green")
    print(ascii_art)
    
    trace_id = gen_trace_id()
    with trace(workflow_name="SSE Example", trace_id=trace_id):
        print(f"View trace: https://platform.openai.com/traces/{trace_id}\n")
        async with MCPServerSse(
            name="CodeInterpreter",
            params={
                "url": "",
            },
        ) as server_2, MCPServerSse(
            name="Slack",
            params={
                "url":""
            }
        ) as server_1:
            slack_agent = Agent(
                name="Slack Assistant",
                instructions="Use the tools to initiate connection with Slack.",
                mcp_servers=[server_1],
                model='gpt-4o',
            )

            message = "Check if i have an active connection with Slack, if not initiate connection"
            print(f"Running: {message}")
            result = await Runner.run(starting_agent=slack_agent, input=message)
            print("Connection Url: ",result.final_output)
            connection_status = await ainput('Are you connected (yes or no)? ')

            user_input = await ainput("What do you want the Agent to do: ")
            if connection_status=='yes':
                await run(server_1, server_2, user_input)
            else:
                print("Try again")

if __name__ == "__main__":
    if not shutil.which("uv"):
        raise RuntimeError(
            "uv is not installed. Please install it: https://docs.astral.sh/uv/getting-started/installation/"
        )
    
    asyncio.run(main()) 
