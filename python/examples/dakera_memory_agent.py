"""Dakera persistent memory — custom toolkit example.

Shows how to give a Composio agent cross-session memory using
`Dakera <https://dakera.ai>`_ — a self-hosted, decay-weighted vector
memory server.

Three in-process custom tools (``STORE_MEMORY``, ``RECALL_MEMORY``,
``FORGET_MEMORY``) are registered on a Composio tool-router session and
handed to an OpenAI Agents SDK agent.  The tool bodies run inside this
Python process and call the Dakera REST API directly — Dakera itself
needs no Composio cloud connection.  Registering the tools into the
agent does use a Composio session, so ``COMPOSIO_API_KEY`` is required.

Quick start
-----------
1. Start a local Dakera instance.  The server needs an object store, so
   run the ``dakera-deploy`` docker-compose stack rather than a bare
   ``docker run`` (compose provisions the storage the server depends on)::

       git clone https://github.com/dakera-ai/dakera-deploy
       cd dakera-deploy && docker compose up -d   # serves on http://localhost:3000

2. Set environment variables::

       export COMPOSIO_API_KEY=...
       export OPENAI_API_KEY=...
       export DAKERA_API_KEY=dk-...                    # the key you configured
       export DAKERA_BASE_URL=http://localhost:3000    # default

3. Run::

       python examples/dakera_memory_agent.py

REST API reference (grounded on the Dakera server)
--------------------------------------------------
POST /v1/memory/store
    Body: {content, agent_id, session_id?, importance?, tags?}
    Returns: {memory: {id, content, agent_id, ...}, embedding_time_ms}

POST /v1/memory/recall
    Body: {agent_id, query, top_k?, session_id?}
    Returns: {memories: [{memory: {id, content, ...}, score}], ...}
    Recall is importance-weighted and decay-aware — stale memories
    surface below fresh, relevant ones.

POST /v1/memory/forget
    Body: {agent_id, memory_ids, ...}  (at least one selector required)
    Returns: {deleted_count}
    The server rejects an unfiltered forget, so it can never wipe an
    agent's whole memory by accident.
"""

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

_DAKERA_BASE_URL = os.environ.get("DAKERA_BASE_URL", "http://localhost:3000").rstrip(
    "/"
)
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
    with httpx.Client(
        base_url=_DAKERA_BASE_URL, headers=_dakera_headers(), timeout=30.0
    ) as c:
        resp = c.post(path, json=payload)
        if resp.is_error:
            raise RuntimeError(
                f"Dakera {path} returned HTTP {resp.status_code}: {resp.text}"
            )
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


class RecallMemoryInput(BaseModel):
    query: str = Field(description="Natural-language query to recall past memories.")
    top_k: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of memories to return, ranked by relevance.",
    )


class ForgetMemoryInput(BaseModel):
    memory_ids: t.List[str] = Field(
        description=(
            "IDs of specific memories to delete (as returned by recall_memory). "
            "At least one ID is required — the Dakera server rejects an "
            "unfiltered forget to guard against accidental bulk deletion."
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
    slug="RECALL_MEMORY",
    name="Recall Memory",
    description=(
        "Retrieve relevant memories from long-term storage using semantic, "
        "importance-weighted recall. Call this at the start of a conversation "
        "to recall what you know about the user or the current topic."
    ),
)
def recall_memory(input: RecallMemoryInput, ctx: t.Any) -> dict[str, t.Any]:
    """Recall the most relevant memories for a query (decay-weighted)."""
    data = _dakera_post(
        "/v1/memory/recall",
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
        "Delete specific memories by ID (as returned by recall_memory). "
        "Use when a memory is outdated, incorrect, or should be removed at "
        "the user's request."
    ),
)
def forget_memory(input: ForgetMemoryInput, ctx: t.Any) -> dict[str, t.Any]:
    """Delete one or more memories from Dakera by ID."""
    ids = [mid for mid in input.memory_ids if mid]
    if not ids:
        # Never send an empty/absent selector: the server would reject it, and
        # deleting nothing is the safe no-op — we must never risk a bulk wipe.
        return {"deleted_count": 0, "memory_ids": []}

    data = _dakera_post(
        "/v1/memory/forget",
        {"agent_id": _AGENT_ID, "memory_ids": ids},
    )
    return {"deleted_count": data.get("deleted_count", 0), "memory_ids": ids}


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a helpful assistant with access to persistent memory.

At the start of each conversation, recall relevant context from memory.
When you learn something important about the user, store it for future recall.
When the user asks you to forget something, recall it first to get its ID,
then call forget_memory with that ID.

Use the memory tools proactively — the user should not have to repeat themselves."""


def _build_agent() -> Agent:
    """Register the custom tools on a Composio session and build the agent.

    Custom tools are registered inline via ``experimental.custom_tools``;
    ``session.tools()`` returns the ``FunctionTool`` instances the OpenAI
    Agents SDK expects (passing the raw decorated tools to ``Agent`` would
    not be invokable).
    """
    session = composio.create(
        user_id="default",
        experimental={
            "custom_tools": [store_memory, recall_memory, forget_memory],
        },
    )
    return Agent(
        name="Dakera Memory Agent",
        instructions=SYSTEM_PROMPT,
        tools=session.tools(),
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    print("Dakera Memory Agent — type 'quit' to exit.\n")

    agent = _build_agent()
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
