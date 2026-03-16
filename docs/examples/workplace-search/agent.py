# region setup
import asyncio
import os
import sys

from agents import Agent, Runner
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider

composio = Composio(provider=OpenAIAgentsProvider())
# endregion setup


# region agent
SYSTEM_PROMPT = """You are a workplace search agent. You have access to GitHub, Slack, Gmail, and Notion.

When the user asks a question:
1. Break it down: decide which apps to search and what to look for.
2. Search across multiple apps in parallel when possible.
3. Synthesize findings into a single answer with citations.

For every piece of information you include, cite the source:
- GitHub: link to the issue, PR, or file
- Slack: channel name and date
- Gmail: sender and subject line
- Notion: page title

If a toolkit is not connected, skip it and note which sources were unavailable.
Do not ask for clarification. Use broad search terms and filter from the results."""
# endregion agent


# region search
async def main():
    # Set USER_ID in your .env file
    user_id = os.environ["USER_ID"]

    session = composio.create(
        user_id=user_id,
        toolkits=["github", "slack", "gmail", "notion"],
    )

    tools = session.tools()

    agent = Agent(
        name="Workplace Search",
        model="gpt-5.4",
        instructions=SYSTEM_PROMPT,
        tools=tools,
    )

    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else input("\nSearch: ")
    result = await Runner.run(starting_agent=agent, input=query)

    print(result.final_output)
# endregion search


asyncio.run(main())
