# MnemoPay provider

Persistent memory and escrow wallet for AI agents, via [MnemoPay](https://mnemopay.io).

## Installation

```bash
pip install composio-mnemopay
```

## Quick start

### Option 1 -- MCP (recommended)

```bash
composio add mcp-mnemopay --url https://mnemopay-mcp.fly.dev/mcp
```

### Option 2 -- Native provider

```python
from composio import Composio
from composio_mnemopay import MnemoPayProvider

composio = Composio(provider=MnemoPayProvider())
tools = composio.tools.get(user_id="default", toolkits=["mnemopay"])
```

## Tools

| Category | Tool | Description |
|----------|------|-------------|
| Memory | `MNEMOPAY_REMEMBER` | Store a persistent memory |
| Memory | `MNEMOPAY_RECALL` | Semantic search over memories |
| Memory | `MNEMOPAY_FORGET` | Delete a memory by ID |
| Memory | `MNEMOPAY_REINFORCE` | Boost a memory's importance |
| Memory | `MNEMOPAY_CONSOLIDATE` | Prune stale memories |
| Payments | `MNEMOPAY_CHARGE` | Create an escrow charge |
| Payments | `MNEMOPAY_SETTLE` | Finalize a pending escrow |
| Payments | `MNEMOPAY_REFUND` | Refund a transaction |
| Observability | `MNEMOPAY_BALANCE` | Wallet balance + reputation |
| Observability | `MNEMOPAY_PROFILE` | Full agent stats |
| Observability | `MNEMOPAY_REPUTATION` | Detailed reputation report |
| Observability | `MNEMOPAY_LOGS` | Immutable audit trail |
| Observability | `MNEMOPAY_HISTORY` | Transaction history |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MNEMOPAY_SERVER_URL` | `https://mnemopay-mcp.fly.dev` | MCP server endpoint |
| `MNEMOPAY_AGENT_ID` | `composio-agent` | Agent identifier |
