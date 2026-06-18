"""
Tool Router direct_tools session preset with OpenAI Agents.

SESSION_PRESET_DIRECT_TOOLS is a shortcut for sessions where the full allowed
tool set is known upfront. It loads all tools allowed by the filters directly
into session.tools() and the MCP tool list.

Usage:
    COMPOSIO_API_KEY=... OPENAI_API_KEY=... python examples/tool_router/direct_tools_preset.py
"""

import os

from agents import Agent, Runner
from composio_openai_agents import OpenAIAgentsProvider
from pydantic import BaseModel, Field

from composio import Composio, SESSION_PRESET_DIRECT_TOOLS


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set {name} before running this example.")
    return value


composio = Composio(
    api_key=require_env("COMPOSIO_API_KEY"),
    base_url=os.environ.get("COMPOSIO_BASE_URL"),
    provider=OpenAIAgentsProvider(),
)
require_env("OPENAI_API_KEY")


class UserNoteInput(BaseModel):
    username: str = Field(description="Hacker News username, for example pg")


hn_research = composio.experimental.Toolkit(
    slug="HN_RESEARCH",
    name="Hacker News research",
    description="Internal research notes for Hacker News users.",
)


@hn_research.tool(
    slug="GET_USER_NOTE",
    name="Get Hacker News user note",
    description="Return an internal research note for a Hacker News username.",
)
def get_user_note(input: UserNoteInput, ctx):
    username = input.username.lower()
    return {
        "username": input.username,
        "note": (
            "Paul Graham; YC co-founder and essayist."
            if username == "pg"
            else f"No curated internal note for {input.username}."
        ),
    }


session = composio.create(
    user_id="direct-tools-example-user",
    session_preset=SESSION_PRESET_DIRECT_TOOLS,
    toolkits=["hackernews"],
    tools={"hackernews": {"enable": ["HACKERNEWS_GET_USER"]}},
    experimental={
        "custom_toolkits": [hn_research],
    },
)

tools = session.tools()
tool_names = [tool.name for tool in tools]
assert "HACKERNEWS_GET_USER" in tool_names
assert "LOCAL_HN_RESEARCH_GET_USER_NOTE" in tool_names
assert "COMPOSIO_SEARCH_TOOLS" not in tool_names

print("Direct tools exposed to the agent:")
for tool in tools:
    print(f"- {tool.name}")

agent = Agent(
    name="Direct Tools Demo Agent",
    instructions="Use the provided tools to perform the task.",
    model=os.environ.get("OPENAI_MODEL", "gpt-5.5"),
    tools=tools,
)

result = Runner.run_sync(
    agent,
    'Look up user "pg" on Hacker News and include any internal research note.',
)
print(result.final_output)
