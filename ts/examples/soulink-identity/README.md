# Soulink Agent Identity Tools

This example registers [Soulink](https://soulink.dev) agent identity verification as custom Composio tools.

## What it adds

Three tools any Composio-connected agent can use:

| Tool | Description |
|------|-------------|
| `SOULINK_RESOLVE_AGENT` | Look up agent's verified on-chain identity (.agent name → wallet address) |
| `SOULINK_CHECK_CREDIT` | Check agent's credit score (0-100, based on peer behavior reports) |
| `SOULINK_VERIFY_IDENTITY` | Verify agent owns their wallet via EIP-191 signed message |

## Why

Composio connects agents to 250+ tools. Soulink adds the missing identity layer — agents can verify who they're interacting with and check trust scores before calling tools or sharing data.

## Setup

1. Set `COMPOSIO_API_KEY` in `.env`
2. Run: `pnpm start`

## Links

- [Soulink](https://soulink.dev) — On-chain identity for AI agents
- [Soulink API](https://soulink.dev/skill.md) — Agent-readable API guide
