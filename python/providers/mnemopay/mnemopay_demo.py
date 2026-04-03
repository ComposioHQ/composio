"""
MnemoPay + Composio demo.

Gives any Composio-connected agent persistent memory and an escrow wallet.
"""

import os

from composio_mnemopay import MnemoPayProvider

from composio import Composio

# Initialize Composio with the MnemoPay provider.
composio = Composio(provider=MnemoPayProvider())

# Get MnemoPay tools -- memory + payments + observability.
tools = composio.tools.get(user_id="default", toolkits=["mnemopay"])
print(f"Loaded {len(tools)} MnemoPay tools")
for tool in tools:
    print(f"  - {tool['name']}: {tool['description'][:60]}...")
