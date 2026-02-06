"""Nory x402 Payment Tools for Composio.

This example shows how to use Nory's x402 payment protocol with Composio,
enabling AI agents to make payments when encountering HTTP 402 Payment Required responses.

Nory supports:
- Solana and 7 EVM chains (Base, Polygon, Arbitrum, Optimism, Avalanche, Sei, IoTeX)
- Sub-400ms settlement times
- Native x402 HTTP payment protocol

Learn more: https://noryx402.com
"""

import os
from typing import Optional

import requests
from pydantic import BaseModel, Field

from composio import Composio

NORY_API_BASE = "https://noryx402.com"

# Initialize Composio
composio = Composio()


# Get optional API key from environment
NORY_API_KEY = os.environ.get("NORY_API_KEY")


def _get_headers(content_type: bool = False) -> dict:
    """Get request headers with optional auth."""
    headers = {}
    if content_type:
        headers["Content-Type"] = "application/json"
    if NORY_API_KEY:
        headers["Authorization"] = f"Bearer {NORY_API_KEY}"
    return headers


# --- Custom Tool Definitions ---


class GetPaymentRequirementsInput(BaseModel):
    """Input for getting x402 payment requirements."""

    resource: str = Field(
        ...,
        description="The resource path requiring payment (e.g., /api/premium/data)",
    )
    amount: str = Field(
        ...,
        description="Amount in human-readable format (e.g., '0.10' for $0.10 USDC)",
    )
    network: Optional[str] = Field(
        None,
        description="Preferred blockchain network (e.g., solana-mainnet, base-mainnet)",
    )


@composio.tools.custom_tool()
def nory_get_payment_requirements(request: GetPaymentRequirementsInput) -> dict:
    """Get x402 payment requirements for accessing a paid resource.

    Use this when you encounter an HTTP 402 Payment Required response
    and need to know how much to pay and where to send payment.

    Returns payment requirements including amount, supported networks, and wallet address.
    """
    params = {"resource": request.resource, "amount": request.amount}
    if request.network:
        params["network"] = request.network

    response = requests.get(
        f"{NORY_API_BASE}/api/x402/requirements",
        params=params,
        headers=_get_headers(),
        timeout=30,
    )
    response.raise_for_status()
    return {"data": response.json(), "successful": True}


class VerifyPaymentInput(BaseModel):
    """Input for verifying a payment transaction."""

    payload: str = Field(
        ...,
        description="Base64-encoded payment payload containing signed transaction",
    )


@composio.tools.custom_tool()
def nory_verify_payment(request: VerifyPaymentInput) -> dict:
    """Verify a signed payment transaction before settlement.

    Use this to validate that a payment transaction is correct
    before submitting it to the blockchain.

    Returns verification result including validity and payer info.
    """
    response = requests.post(
        f"{NORY_API_BASE}/api/x402/verify",
        json={"payload": request.payload},
        headers=_get_headers(content_type=True),
        timeout=30,
    )
    response.raise_for_status()
    return {"data": response.json(), "successful": True}


class SettlePaymentInput(BaseModel):
    """Input for settling a payment on-chain."""

    payload: str = Field(
        ...,
        description="Base64-encoded payment payload",
    )


@composio.tools.custom_tool()
def nory_settle_payment(request: SettlePaymentInput) -> dict:
    """Settle a payment on-chain with ~400ms settlement time.

    Use this to submit a verified payment transaction to the blockchain.
    Settlement typically completes in under 400ms.

    Returns settlement result including transaction ID and network.
    """
    response = requests.post(
        f"{NORY_API_BASE}/api/x402/settle",
        json={"payload": request.payload},
        headers=_get_headers(content_type=True),
        timeout=30,
    )
    response.raise_for_status()
    return {"data": response.json(), "successful": True}


class LookupTransactionInput(BaseModel):
    """Input for looking up a transaction."""

    transaction_id: str = Field(
        ...,
        description="Transaction ID or signature",
    )
    network: str = Field(
        ...,
        description="Network where the transaction was submitted (e.g., solana-mainnet)",
    )


@composio.tools.custom_tool()
def nory_lookup_transaction(request: LookupTransactionInput) -> dict:
    """Look up the status of a previously submitted payment transaction.

    Use this to check the status of a payment including confirmations
    and current state (pending, confirmed, failed).
    """
    response = requests.get(
        f"{NORY_API_BASE}/api/x402/transactions/{request.transaction_id}",
        params={"network": request.network},
        headers=_get_headers(),
        timeout=30,
    )
    response.raise_for_status()
    return {"data": response.json(), "successful": True}


class HealthCheckInput(BaseModel):
    """Input for health check (no parameters needed)."""

    pass


@composio.tools.custom_tool()
def nory_health_check(request: HealthCheckInput) -> dict:
    """Check Nory service health and see supported networks.

    Use this to verify the payment service is operational
    before attempting payments.

    Returns health status and list of supported blockchain networks.
    """
    response = requests.get(
        f"{NORY_API_BASE}/api/x402/health",
        timeout=30,
    )
    response.raise_for_status()
    return {"data": response.json(), "successful": True}


# --- Example Usage ---

if __name__ == "__main__":
    # Check service health
    print("Checking Nory x402 service health...")
    result = composio.tools.execute(
        user_id="default",
        slug=nory_health_check.slug,
        arguments={},
    )
    print(f"Health check result: {result}")

    # Example: Get payment requirements for a resource
    print("\nGetting payment requirements...")
    result = composio.tools.execute(
        user_id="default",
        slug=nory_get_payment_requirements.slug,
        arguments={
            "resource": "/api/premium/data",
            "amount": "0.10",
            "network": "solana-mainnet",
        },
    )
    print(f"Payment requirements: {result}")
