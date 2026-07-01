"""Dakera persistent memory — custom toolkit example.

Shows how to give a Composio agent cross-session memory using
`Dakera <https://dakera.ai>`_ — a self-hosted, decay-weighted vector
memory server.

The three tools registered here (``STORE_MEMORY``, ``SEARCH_MEMORY``,
``FORGET_MEMORY``) are in-process ``experimental`` tools: they run inside
the Python process and call the Dakera REST API directly.  No Composio
cloud connection is needed for the Dakera calls.

Quick start
-----------
1. Start a local Dakera instance::

       docker run -d -p 3300:3300 \\
         -e DAKERA_API_KEY=demo \\
         ghcr.io/dakera-ai/dakera:latest

2. Set environment variables::

       export COMPOSIO_API_KEY=...
       export OPENAI_API_KEY=...
       export DAKERA_API_KEY=demo
       export DAKERA_BASE_URL=http://localhost:3300   # default

3. Run::

       python examples/dakera_memory_agent.py

REST API reference
------------------
POST /v1/memory/store
    Body: {content, agent_id, session_id?, importance?, tags?, metadata?}
    Returns: {memory: {id, content, agent_id, ...}}

POST /v1/memory/search
    Body: {agent_id, query, top_k?, session_id?}
    Returns: {memories: [{memory: {id, content, ...}, score}]}

POST /v1/memory/forget
    Body: {agent_id, memory_ids?}
    Returns: {success: true}
"""

from __future__ import annotations

import asyncio
import os
import typing as t

import httpx
from agents import Agent, Runner
from pydantic import BaseModel, Field

from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider

# ---------------------------------------------------------------------------
# Configuration (read from environment at call time)
# ---------------------------------------------------------------------------

_DAKERA_BASE_URL = os.environ.get("DAKERA_BASE_URL", "http://localhost:3300").rstrip("/")
_DAKERA_API_KEY = os.environ.get("DAKERA_API_KEY", "")
_AGENT_ID = "composio-demo-agent"


def _dakera_headers() -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if _DAKERA_API_KEY:
        headers["Authorization"] = f"Bearer {_DAKERA_API_KEY}"
    return headers


# ---------------------------------------------------------------------------
# Dakera HTTP helpers
# ---------------------------------------------------------------------------


def _dakera_post(path: str, payload: dict[str, t.Any]) -> dict[str, t.Any]:
    """Call a Dakera REST endpoint and return the parsed JSON response."""
    with httpx.Client(base_url=_DAKERA_BASE_URL, headers=_dakera_headers(), timeout=30.0) as c:
        resp = c.post(path, json=payload)
        if resp.is_error:
            raise RuntimeError(f"Dakera {path} returned HTTP {resp.status_code}: {resp.text}")
        return resp.json()


# ---------------------------------------------------------------------------
# Composio setup
# ---------------------------------------------------------------------------

composio = Composio(provider=OpenAIAgentsProvider())


# ---------------------------------------------------------------------------
# Custom tool input models
# ---------------------------------------------------------------------------


class StoreMemoryInput(BaseModel):
    content: str = Field(description="The text to remember.")
    session_id: t.Optional[str] = Field(
        default=None,
        description="Optional session scope for this memory.",
    )
    importance: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Initial importance score [0–1]. Higher values decay more slowly.",
    )
    tags: t.Optional[t.List[str]] = Field(
        default=None,
        description="Optional tags for later filtering (e.g. ['preference', 'decision']).",
    )


class SearchMemoryInput(BaseModel):
    query: str = Field(description="Natural-language query to search past memories.")
    top_k: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of memories to return, ranked by relevance.",
    )


class ForgetMemoryInput(BaseModel):
    memory_ids: t.Optional[t.List[str]] = Field(
        default=None,
        description=(
            "Specific memory IDs to delete. "
            "Omit to wipe ALL memories for this agent."
        ),
    )


# ---------------------------------------------------------------------------
# Tool definitions using @composio.experimental.tool()
# ---------------------------------------------------------------------------


@composio.experimental.tool(
    slug="STORE_MEMORY",
    name="Store Memory",
    description=(
        "Persist a new text memory to long-term storage. "
        "Call this when you learn something important that should be remembered "
        "in future conversations — user preferences, decisions, or key facts."
    ),
)
def store_memory(input: StoreMemoryInput, ctx: t.Any) -> dict[str, t.Any]:
    """Store a memory record in Dakera."""
    payload: dict[str, t.Any] = {
        "content": input.content,
        "agent_id": _AGENT_ID,
        "importance": input.importance,
    }
    if input.session_id:
        payload["session_id"] = input.session_id
    if input.tags:
        payload["tags"] = input.tags

    data = _dakera_post("/v1/memory/store", payload)
    memory = data.get("memory", {})
    return {
        "id": memory.get("id", ""),
        "content": memory.get("content", input.content),
        "stored": True,
    }


@composio.experimental.tool(
    slug="SEARCH_MEMORY",
    name="Search Memory",
    description=(
        "Retrieve relevant memories from long-term storage using semantic search. "
        "Call this at the start of a conversation to recall what you know about "
        "the user or the current topic."
    ),
)
def search_memory(input: SearchMemoryInput, ctx: t.Any) -> dict[str, t.Any]:
    """Retrieve the most semantically relevant memories for a query."""
    data = _dakera_post(
        "/v1/memory/search",
        {
            "agent_id": _AGENT_ID,
            "query": input.query,
            "top_k": input.top_k,
        },
    )
    memories = [
        {
            "id": hit["memory"]["id"],
            "content": hit["memory"]["content"],
            "score": round(hit["score"], 4),
        }
        for hit in data.get("memories", [])
    ]
    return {"memories": memories, "count": len(memories)}


@composio.experimental.tool(
    slug="FORGET_MEMORY",
    name="Forget Memory",
    description=(
        "Delete specific memories or wipe all memories for this agent. "
        "Use when a memory is outdated, incorrect, or should be removed at "
        "the user's request."
    ),
)
def forget_memory(input: ForgetMemoryInput, ctx: t.Any) -> dict[str, t.Any]:
    """Delete one or more memories from Dakera."""
    payload: dict[str, t.Any] = {"agent_id": _AGENT_ID}
    if input.memory_ids is not None:
        payload["memory_ids"] = input.memory_ids

    _dakera_post("/v1/memory/forget", payload)
    return {"success": True, "deleted": input.memory_ids or "all"}


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a helpful assistant with access to persistent memory.

At the start of each conversation, search your memory for relevant context.
When you learn something important about the user, store it for future recall.
When the user asks you to forget something, call forget_memory.

Use the memory tools proactively — the user should not have to repeat themselves."""

agent = Agent(
    name="Dakera Memory Agent",
    instructions=SYSTEM_PROMPT,
    tools=[store_memory, search_memory, forget_memory],
)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    print("Dakera Memory Agent — type 'quit' to exit.\n")

    session_id = "demo-session"

    while True:
        user_input = input("You: ").strip()
        if not user_input or user_input.lower() in {"quit", "exit"}:
            break

        result = await Runner.run(
            agent,
            input=f"[session:{session_id}] {user_input}",
        )
        print(f"\nAgent: {result.final_output}\n")


if __name__ == "__main__":
    asyncio.run(main())
