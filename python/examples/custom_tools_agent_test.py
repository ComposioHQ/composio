"""
Custom Tools — local tools + proxy execute with OpenAI Agents SDK.

Shows how to create custom tools that run in-process alongside
remote Composio tools. Includes all three patterns: standalone,
extension (Gmail proxy), and custom toolkit.

Usage:
    COMPOSIO_API_KEY=... OPENAI_API_KEY=... python examples/custom_tools_agent_test.py
"""
# ruff: noqa: E302, E303

import asyncio
import base64
import os
import sys

from agents import Agent, Runner
from pydantic import BaseModel, Field
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider

composio = Composio(provider=OpenAIAgentsProvider())

# ── 1. Standalone tool — slug/name/description inferred from function ──


class UserLookupInput(BaseModel):
    user_id: str = Field(description="User ID (e.g. user-1)")


USERS = {
    "user-1": {"name": "Alice Johnson", "email": "alice@acme.com", "role": "admin"},
    "user-2": {"name": "Bob Smith", "email": "bob@acme.com", "role": "developer"},
}


@composio.experimental.tool()
def get_user(input: UserLookupInput, ctx):
    """Look up an internal user by ID. Returns name, email, and role."""
    user = USERS.get(input.user_id)
    if not user:
        raise ValueError(f'User "{input.user_id}" not found')
    return user


# ── 2. Standalone tool with overrides ──────────────────────────────────


class GreetInput(BaseModel):
    name: str = Field(description="Name to greet")
    style: str = Field(default="friendly", description="Greeting style")


@composio.experimental.tool(
    slug="GREET_V2",
    name="Greeting Generator",
    description="Generate a personalized greeting message in different styles.",
)
def greet(input: GreetInput, ctx):
    """This docstring is ignored because description= is set above."""
    greetings = {
        "friendly": f"Hey {input.name}! Great to see you!",
        "formal": f"Dear {input.name}, I hope this message finds you well.",
        "casual": f"Yo {input.name}, what's up?",
    }
    return {"message": greetings.get(input.style, f"Hello {input.name}!")}


# ── 3. Extension tool — inherits Gmail auth via ctx.proxy_execute() ────


class DraftInput(BaseModel):
    to: str = Field(description="Recipient email address")
    subject: str = Field(description="Email subject")
    body: str = Field(description="Email body (plain text)")


@composio.experimental.tool(extends_toolkit="gmail")
def create_draft(input: DraftInput, ctx):
    """Create a real Gmail draft. Appears in the user's drafts folder."""
    raw_msg = (
        f"To: {input.to}\r\nSubject: {input.subject}\r\n"
        f"Content-Type: text/plain; charset=UTF-8\r\n\r\n{input.body}"
    )
    raw = base64.urlsafe_b64encode(raw_msg.encode()).decode().rstrip("=")
    res = ctx.proxy_execute(
        toolkit="gmail",
        endpoint="https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        method="POST",
        body={"message": {"raw": raw}},
    )
    if res["status"] != 200:
        raise RuntimeError(f"Gmail API error {res['status']}")
    data = res["data"]
    return {"draft_id": data["id"], "to": input.to, "subject": input.subject}


# ── 4. Custom toolkit — groups related tools under one namespace ───────

role_manager = composio.experimental.Toolkit(
    slug="ROLE_MANAGER",
    name="Role Manager",
    description="Manage user roles in the system",
)


class SetRoleInput(BaseModel):
    user_id: str = Field(description="User ID")
    role: str = Field(description="New role (admin, developer, viewer)")


@role_manager.tool()
def set_role(input: SetRoleInput, ctx):
    """Set a user's role. Returns confirmation."""
    return {"user_id": input.user_id, "role": input.role, "updated": True}


@role_manager.tool(name="List All Roles")
def list_roles(input: UserLookupInput, ctx):
    """List available roles for a user."""
    return {"roles": ["admin", "developer", "viewer"], "current": "admin"}


# ── Agent ──────────────────────────────────────────────────────────────


async def run_test(prompt, test_name):
    print(f"\n{'=' * 60}")
    print(f"TEST: {test_name}")
    print(f"{'=' * 60}")

    session = composio.create(
        user_id="default",
        toolkits=["gmail", "weathermap"],
        manage_connections=True,
        experimental={
            "custom_tools": [get_user, greet, create_draft],
            "custom_toolkits": [role_manager],
        },
    )
    tools = session.tools()
    agent = Agent(
        name="Assistant",
        instructions=(
            "You are a helpful assistant. Use Composio tools to execute tasks. "
            "In MULTI_EXECUTE, always pass arguments inside the arguments field."
        ),
        model="gpt-4.1-mini",
        tools=tools,
    )

    print(f"> {prompt}\n")
    try:
        result = await Runner.run(agent, prompt, max_turns=25)
        print(f"\nAgent: {result.final_output}")
        return True
    except Exception as e:
        print(f"\nERROR: {e}")
        return False


async def main():
    tests = [
        ("Look up user-2", "Standalone (inferred slug/name)"),
        ("Generate a formal greeting for Alice", "Standalone (overridden slug/name)"),
        ("Set user-1 role to developer", "Toolkit tool"),
        ("Look up user-1 and set their role to viewer", "Mixed local tools"),
        ("What is the weather in Tokyo?", "Remote (weathermap)"),
        (
            'Draft an email to bob@acme.com with subject "Test" and body "Hello!"',
            "Gmail proxy",
        ),
        (
            "Look up user-1, draft them an email saying hi, include weather in SF",
            "Mixed all",
        ),
    ]

    results = []
    for prompt, name in tests:
        ok = await run_test(prompt, name)
        results.append((name, ok))

    print(f"\n{'=' * 60}")
    print("RESULTS")
    print(f"{'=' * 60}")
    for name, ok in results:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    print(f"\n{sum(1 for _, ok in results if ok)}/{len(results)} passed")


if __name__ == "__main__":
    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY env var required")
        sys.exit(1)
    asyncio.run(main())
