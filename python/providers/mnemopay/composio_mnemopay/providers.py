"""
MnemoPay Provider for Composio SDK.

Gives any Composio-connected agent persistent memory and an escrow
wallet via the MnemoPay MCP server.  Works in two modes:

1. **MCP mode (recommended)** -- point Composio at the MnemoPay MCP
   endpoint and the tools appear automatically.
2. **Native mode** -- use ``MnemoPayProvider`` as a Composio provider
   that wraps the MnemoPay HTTP/stdio transport directly.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import typing as t

import pydantic

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import json_schema_to_model


# ---------------------------------------------------------------------------
# Lightweight MCP client (HTTP or stdio) -- zero external deps beyond stdlib
# ---------------------------------------------------------------------------

class _MCPResult(t.NamedTuple):
    """Structured result from MCP transport calls.

    Using a dedicated type avoids in-band error signaling where a
    successful tool result (e.g. a recalled memory containing the text
    ``"Error: ..."`` ) could be misclassified as a transport failure.
    """

    ok: bool
    value: str


class _MnemoPayClient:
    """Thin client that talks JSON-RPC to the MnemoPay MCP server."""

    def __init__(
        self,
        server_url: str | None = None,
        agent_id: str = "composio-agent",
        mode: str = "quick",
    ) -> None:
        self.server_url = server_url or os.environ.get("MNEMOPAY_SERVER_URL")
        self.agent_id = agent_id
        self.mode = mode
        self._process: subprocess.Popen | None = None
        self._request_id = 0
        self._lock = threading.Lock()

    # -- public ------------------------------------------------------------

    def call_tool(
        self, name: str, arguments: dict[str, t.Any] | None = None
    ) -> _MCPResult:
        if self.server_url:
            return self._call_http(name, arguments or {})
        return self._call_stdio(name, arguments or {})

    # -- transports --------------------------------------------------------

    def _call_http(self, name: str, arguments: dict[str, t.Any]) -> _MCPResult:
        import urllib.request

        data = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
        ).encode()
        req = urllib.request.Request(
            f"{self.server_url}/mcp",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode())
                if "result" in result:
                    content = result["result"].get("content", [])
                    text = content[0].get("text", str(content)) if content else "OK"
                    return _MCPResult(ok=True, value=text)
                if "error" in result:
                    msg = result["error"].get("message", str(result["error"]))
                    return _MCPResult(ok=False, value=msg)
                return _MCPResult(ok=True, value=str(result))
        except Exception as e:
            return _MCPResult(ok=False, value=f"MCP transport error: {e}")

    def _call_stdio(self, name: str, arguments: dict[str, t.Any]) -> _MCPResult:
        with self._lock:
            if self._process is None or self._process.poll() is not None:
                env = {
                    **os.environ,
                    "MNEMOPAY_AGENT_ID": self.agent_id,
                    "MNEMOPAY_MODE": self.mode,
                }
                self._process = subprocess.Popen(
                    ["npx", "-y", "@mnemopay/sdk"],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    env=env,
                )
            assert self._process and self._process.stdin and self._process.stdout
            request = {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
            try:
                self._process.stdin.write(json.dumps(request).encode() + b"\n")
                self._process.stdin.flush()
                raw = self._process.stdout.readline()
                if not raw:
                    return _MCPResult(ok=False, value="MCP server closed")
                response = json.loads(raw.decode())
                content = response.get("result", {}).get("content", [])
                if content and isinstance(content, list):
                    return _MCPResult(
                        ok=True,
                        value=content[0].get("text", str(content)),
                    )
                if "error" in response:
                    msg = response["error"].get(
                        "message", str(response["error"])
                    )
                    return _MCPResult(ok=False, value=msg)
                return _MCPResult(
                    ok=True, value=str(response.get("result", {}))
                )
            except Exception as e:
                return _MCPResult(ok=False, value=f"MCP transport error: {e}")

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id


# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------

_client: _MnemoPayClient | None = None


def _get_client() -> _MnemoPayClient:
    global _client
    if _client is None:
        _client = _MnemoPayClient(
            server_url=os.environ.get(
                "MNEMOPAY_SERVER_URL", "https://mnemopay-mcp.fly.dev"
            ),
            agent_id=os.environ.get("MNEMOPAY_AGENT_ID", "composio-agent"),
        )
    return _client


# ---------------------------------------------------------------------------
# Composio Provider
# ---------------------------------------------------------------------------

class MnemoPayProvider(
    AgenticProvider[dict, list[dict]],
    name="mnemopay",
):
    """
    Composio provider for MnemoPay -- persistent memory and escrow
    wallet for AI agents.

    Wraps 13 MnemoPay tools (memory CRUD, payments, observability) so
    they can be used alongside any other Composio toolkit.

    Example::

        from composio import Composio
        from composio_mnemopay import MnemoPayProvider

        composio = Composio(provider=MnemoPayProvider())
        tools = composio.tools.get(user_id="default", toolkits=["mnemopay"])
    """

    # MnemoPay tool definitions exposed to Composio
    MNEMOPAY_TOOLS: t.ClassVar[list[dict[str, t.Any]]] = [
        # -- Memory --
        {
            "slug": "MNEMOPAY_REMEMBER",
            "description": (
                "Store a memory that persists across sessions. "
                "Use for facts, preferences, decisions, and observations."
            ),
            "mcp_name": "remember",
            "input_parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The content to remember.",
                    },
                    "importance": {
                        "type": "number",
                        "description": "Importance score (0-1). Auto-scored if omitted.",
                    },
                },
                "required": ["content"],
            },
        },
        {
            "slug": "MNEMOPAY_RECALL",
            "description": (
                "Recall the most relevant memories. "
                "Supports semantic search when a query is provided."
            ),
            "mcp_name": "recall",
            "input_parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Semantic search query.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max memories to return.",
                        "default": 5,
                    },
                },
                "required": [],
            },
        },
        {
            "slug": "MNEMOPAY_FORGET",
            "description": "Permanently delete a memory by ID.",
            "mcp_name": "forget",
            "input_parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Memory ID to delete.",
                    },
                },
                "required": ["id"],
            },
        },
        {
            "slug": "MNEMOPAY_REINFORCE",
            "description": "Boost a memory's importance after it proved valuable.",
            "mcp_name": "reinforce",
            "input_parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Memory ID to reinforce.",
                    },
                    "boost": {
                        "type": "number",
                        "description": "Boost amount.",
                        "default": 0.1,
                    },
                },
                "required": ["id"],
            },
        },
        {
            "slug": "MNEMOPAY_CONSOLIDATE",
            "description": "Prune stale memories whose scores have decayed below threshold.",
            "mcp_name": "consolidate",
            "input_parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
        # -- Payments --
        {
            "slug": "MNEMOPAY_CHARGE",
            "description": (
                "Create an escrow charge for work delivered. "
                "Only charge AFTER delivering value."
            ),
            "mcp_name": "charge",
            "input_parameters": {
                "type": "object",
                "properties": {
                    "amount": {
                        "type": "number",
                        "description": "Amount to charge.",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Reason for the charge.",
                    },
                },
                "required": ["amount", "reason"],
            },
        },
        {
            "slug": "MNEMOPAY_SETTLE",
            "description": (
                "Finalize a pending escrow. "
                "Boosts reputation +0.01, reinforces recent memories +0.05."
            ),
            "mcp_name": "settle",
            "input_parameters": {
                "type": "object",
                "properties": {
                    "tx_id": {
                        "type": "string",
                        "description": "Transaction ID to settle.",
                    },
                },
                "required": ["tx_id"],
            },
        },
        {
            "slug": "MNEMOPAY_REFUND",
            "description": "Refund a transaction. Docks reputation by -0.05 if already settled.",
            "mcp_name": "refund",
            "input_parameters": {
                "type": "object",
                "properties": {
                    "tx_id": {
                        "type": "string",
                        "description": "Transaction ID to refund.",
                    },
                },
                "required": ["tx_id"],
            },
        },
        # -- Observability --
        {
            "slug": "MNEMOPAY_BALANCE",
            "description": "Check wallet balance and reputation score.",
            "mcp_name": "balance",
            "input_parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
        {
            "slug": "MNEMOPAY_PROFILE",
            "description": (
                "Full agent stats: reputation, wallet, memory count, "
                "transaction count."
            ),
            "mcp_name": "profile",
            "input_parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
        {
            "slug": "MNEMOPAY_REPUTATION",
            "description": (
                "Full reputation report: score, tier, settlement rate, "
                "total value settled."
            ),
            "mcp_name": "reputation",
            "input_parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
        {
            "slug": "MNEMOPAY_LOGS",
            "description": "Immutable audit trail of all memory and payment actions.",
            "mcp_name": "logs",
            "input_parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max log entries to return.",
                        "default": 20,
                    },
                },
                "required": [],
            },
        },
        {
            "slug": "MNEMOPAY_HISTORY",
            "description": "Transaction history, most recent first.",
            "mcp_name": "history",
            "input_parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max transactions to return.",
                        "default": 10,
                    },
                },
                "required": [],
            },
        },
    ]

    def _execute_mnemopay(self, slug: str, arguments: dict) -> dict:
        """Route a Composio tool call to the MnemoPay MCP server."""
        # Map MNEMOPAY_REMEMBER -> remember, etc.
        tool_def = next(
            (t for t in self.MNEMOPAY_TOOLS if t["slug"] == slug), None
        )
        if tool_def is None:
            return {
                "data": None,
                "error": f"Unknown MnemoPay tool: {slug}",
                "successful": False,
            }
        mcp_name = tool_def["mcp_name"]

        # Remap tx_id -> txId for settle/refund
        mcp_args = dict(arguments)
        if "tx_id" in mcp_args:
            mcp_args["txId"] = mcp_args.pop("tx_id")

        result = _get_client().call_tool(mcp_name, mcp_args)
        if result.ok:
            return {
                "data": {"result": result.value},
                "error": None,
                "successful": True,
            }
        return {
            "data": None,
            "error": result.value,
            "successful": False,
        }

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> dict:
        """Wrap a Composio tool as a simple dict descriptor."""

        def _execute(**kwargs: t.Any) -> dict:
            try:
                # Route MnemoPay tools to the MCP server; everything else
                # goes through the standard Composio execute callback.
                if tool.slug.startswith("MNEMOPAY_"):
                    return self._execute_mnemopay(
                        slug=tool.slug, arguments=kwargs
                    )
                return execute_tool(slug=tool.slug, arguments=kwargs)
            except pydantic.ValidationError as e:
                return {
                    "successful": False,
                    "error": parse_pydantic_error(e),
                    "data": None,
                }

        return {
            "name": tool.slug,
            "description": tool.description,
            "parameters": json_schema_to_model(
                json_schema=tool.input_parameters,
                skip_default=self.skip_default,
            ),
            "execute": _execute,
        }

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[dict]:
        """Wrap a list of tools as a list of dict descriptors."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
