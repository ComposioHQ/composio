"""
Tool Router preload with OpenAI Agents.

Shows direct tool exposure for:
1. Composio tools via preload["tools"].
2. SDK custom tools via preload=True on the custom tool or toolkit.
3. A nested custom tool override with preload=False inside a preloaded toolkit.

Usage:
    COMPOSIO_API_KEY=... OPENAI_API_KEY=... python examples/tool_router/preload.py
"""

import os

from agents import Agent, Runner
from composio_openai_agents import OpenAIAgentsProvider
from pydantic import BaseModel, Field

from composio import Composio


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set {name} before running this example.")
    return value


class UserLookupInput(BaseModel):
    user_id: str = Field(description="Internal user ID, for example user-1")


class TeamSearchInput(BaseModel):
    team: str = Field(description="Team name to search for")


class AccountInput(BaseModel):
    user_id: str = Field(description="Internal user ID")


INTERNAL_USERS = {
    "user-1": {
        "id": "user-1",
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "team": "platform",
        "plan": "enterprise",
    },
    "user-2": {
        "id": "user-2",
        "name": "Grace Hopper",
        "email": "grace@example.com",
        "team": "developer-tools",
        "plan": "startup",
    },
}


composio = Composio(
    api_key=require_env("COMPOSIO_API_KEY"),
    base_url=os.environ.get("COMPOSIO_BASE_URL"),
    provider=OpenAIAgentsProvider(),
)
require_env("OPENAI_API_KEY")


@composio.experimental.tool(
    slug="LOOKUP_INTERNAL_USER",
    name="Lookup internal user",
    description="Look up an internal demo user profile by user ID.",
    preload=True,
)
def lookup_internal_user(input: UserLookupInput, ctx):
    user = INTERNAL_USERS.get(input.user_id)
    if not user:
        raise ValueError(f'User "{input.user_id}" not found')
    return user


@composio.experimental.tool(
    slug="SEARCH_INTERNAL_USERS",
    name="Search internal users",
    description=(
        "Search demo internal users by team. This custom tool is search-only "
        "because preload is not enabled."
    ),
)
def search_internal_users(input: TeamSearchInput, ctx):
    return {
        "results": [
            user for user in INTERNAL_USERS.values() if user["team"] == input.team
        ]
    }


internal_admin = composio.experimental.Toolkit(
    slug="INTERNAL_ADMIN",
    name="Internal admin",
    description="Demo internal administration tools.",
    preload=True,
)


@internal_admin.tool(
    slug="GET_ACCOUNT_HEALTH",
    name="Get account health",
    description="Return internal account health details for a user.",
)
def get_account_health(input: AccountInput, ctx):
    return {
        "user_id": input.user_id,
        "health": "green",
        "open_incidents": 0,
        "renewal_risk": "low",
    }


@internal_admin.tool(
    slug="GET_ACCOUNT_AUDIT_LOG",
    name="Get account audit log",
    description=(
        "Return internal account audit events. This overrides the toolkit "
        "preload default and remains search-only."
    ),
    preload=False,
)
def get_account_audit_log(input: AccountInput, ctx):
    return {
        "user_id": input.user_id,
        "events": ["login", "settings_viewed"],
    }


session = composio.create(
    user_id="preload-example-user",
    toolkits=["hackernews"],
    tools={"hackernews": {"enable": ["HACKERNEWS_GET_USER"]}},
    preload={"tools": ["HACKERNEWS_GET_USER"]},
    manage_connections=False,
    experimental={
        "custom_tools": [lookup_internal_user, search_internal_users],
        "custom_toolkits": [internal_admin],
    },
)

tools = session.tools()
tool_names = [tool.name for tool in tools]
assert "HACKERNEWS_GET_USER" in tool_names
assert "LOCAL_LOOKUP_INTERNAL_USER" in tool_names
assert "LOCAL_INTERNAL_ADMIN_GET_ACCOUNT_HEALTH" in tool_names
assert "LOCAL_SEARCH_INTERNAL_USERS" not in tool_names
assert "LOCAL_INTERNAL_ADMIN_GET_ACCOUNT_AUDIT_LOG" not in tool_names

print("Direct tools exposed to the agent:")
for tool in tools:
    print(f"- {tool.name}")

agent = Agent(
    name="Preload Demo Agent",
    instructions="Use the provided tools to perform the task.",
    model=os.environ.get("OPENAI_MODEL", "gpt-5.5"),
    tools=tools,
)

prompt = (
    'Look up Hacker News user "pg", then look up internal user user-1 and '
    "their account health. Summarize the useful facts."
)
result = Runner.run_sync(agent, prompt)
print(result.final_output)
