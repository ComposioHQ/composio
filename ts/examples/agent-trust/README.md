# Agent Trust Gate Example

This example shows how to use the [TWZRD Agent Intel](https://intel.twzrd.xyz) MCP server
as a trust gate before executing Composio actions.

## Flow

1. Call `preflight_check(wallet)` on the TWZRD Agent Intel MCP server (free, no API key).
2. If the agent passes the trust check, proceed to execute the Composio action.
3. If the agent fails, block execution.

## Setup

```bash
pnpm install
cp .env.example .env
# Add COMPOSIO_API_KEY and OPENAI_API_KEY
```

## Run

```bash
pnpm start
```

## TWZRD Agent Intel Tools

| Tool | Auth | Description |
|------|------|-------------|
| `score_agent(wallet)` | Free | Trust score 0–100 |
| `preflight_check(wallet)` | Free | Pass/fail gate |
| `get_trust_receipt(wallet)` | Paid (x402) | On-chain receipt |

MCP endpoint: `https://intel.twzrd.xyz/mcp` (streamable-HTTP, no auth for free tools)
