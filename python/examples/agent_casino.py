"""
Agent Casino — Custom Tool Integration

This example shows how to integrate Agent Casino's provably fair
gambling API (dice, coinflip, roulette) as custom Composio tools.

Prerequisites:
1. pip install composio-core requests pydantic
2. Get an Agent Casino API key at https://agent.rollhub.com
3. Set AGENT_CASINO_API_KEY environment variable

API docs & OpenAPI spec: https://github.com/rollhub-dev/composio-agent-casino
"""

import os

import requests
from pydantic import BaseModel, Field

from composio import Composio

composio = Composio()

AGENT_CASINO_BASE = "https://agent.rollhub.com/api/v1"
API_KEY = os.environ.get("AGENT_CASINO_API_KEY", "")


def _headers():
    return {"X-API-Key": API_KEY, "Content-Type": "application/json"}


# ── Registration ──────────────────────────────────────────────


class RegisterInput(BaseModel):
    wallet_address: str = Field(..., description="Crypto wallet address to register")


@composio.tools.custom_tool(toolkit="agent-casino")
def agent_casino_register(request: RegisterInput) -> dict:
    """Register a new agent with Agent Casino using a wallet address. Returns an API key."""
    resp = requests.post(
        f"{AGENT_CASINO_BASE}/register",
        json={"wallet_address": request.wallet_address},
    )
    return resp.json()


# ── Dice ──────────────────────────────────────────────────────


class DiceInput(BaseModel):
    amount: float = Field(..., description="Bet amount in USD")
    target: int = Field(..., description="Target number (1-100)")
    direction: str = Field(..., description="'over' or 'under'")
    client_secret: str = Field(
        default="", description="Optional client secret for provably fair verification"
    )


@composio.tools.custom_tool(toolkit="agent-casino")
def agent_casino_play_dice(request: DiceInput) -> dict:
    """Place a dice bet — roll over or under a target number (1-100). 99% RTP."""
    payload = {
        "amount": request.amount,
        "target": request.target,
        "direction": request.direction,
    }
    if request.client_secret:
        payload["client_secret"] = request.client_secret
    resp = requests.post(
        f"{AGENT_CASINO_BASE}/dice", json=payload, headers=_headers()
    )
    return resp.json()


# ── Coinflip ──────────────────────────────────────────────────


class CoinflipInput(BaseModel):
    amount: float = Field(..., description="Bet amount in USD")
    side: str = Field(..., description="'heads' or 'tails'")
    client_seed: str = Field(default="", description="Optional client seed")


@composio.tools.custom_tool(toolkit="agent-casino")
def agent_casino_play_coinflip(request: CoinflipInput) -> dict:
    """Place a coinflip bet — heads or tails. 98% RTP."""
    payload = {"amount": request.amount, "side": request.side}
    if request.client_seed:
        payload["client_seed"] = request.client_seed
    resp = requests.post(
        f"{AGENT_CASINO_BASE}/coinflip/bet", json=payload, headers=_headers()
    )
    return resp.json()


# ── Roulette ──────────────────────────────────────────────────


class RouletteInput(BaseModel):
    amount: float = Field(..., description="Bet amount in USD")
    bet_type: str = Field(
        ...,
        description="Bet type: number, color, odd_even, dozen, column, half",
    )
    bet_value: str = Field(
        ...,
        description="Bet value — e.g. '17', 'red', 'odd', '1st', '19-36'",
    )
    client_seed: str = Field(default="", description="Optional client seed")


@composio.tools.custom_tool(toolkit="agent-casino")
def agent_casino_play_roulette(request: RouletteInput) -> dict:
    """Place a roulette bet — number, color, odd/even, dozen, column, or half. 97.3% RTP."""
    payload = {
        "amount": request.amount,
        "bet_type": request.bet_type,
        "bet_value": request.bet_value,
    }
    if request.client_seed:
        payload["client_seed"] = request.client_seed
    resp = requests.post(
        f"{AGENT_CASINO_BASE}/roulette/bet", json=payload, headers=_headers()
    )
    return resp.json()


# ── Balance ───────────────────────────────────────────────────


@composio.tools.custom_tool(toolkit="agent-casino")
def agent_casino_get_balance(request: BaseModel) -> dict:
    """Check current Agent Casino account balance."""
    resp = requests.get(f"{AGENT_CASINO_BASE}/balance", headers=_headers())
    return resp.json()


# ── Verify Bet ────────────────────────────────────────────────


class VerifyInput(BaseModel):
    bet_id: str = Field(..., description="The bet ID to verify")


@composio.tools.custom_tool(toolkit="agent-casino")
def agent_casino_verify_bet(request: VerifyInput) -> dict:
    """Verify the provable fairness of any past bet using its cryptographic proof."""
    resp = requests.get(
        f"{AGENT_CASINO_BASE}/verify/{request.bet_id}", headers=_headers()
    )
    return resp.json()


# ── Demo ──────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Agent Casino tools registered with Composio:")
    for fn in [
        agent_casino_register,
        agent_casino_play_dice,
        agent_casino_play_coinflip,
        agent_casino_play_roulette,
        agent_casino_get_balance,
        agent_casino_verify_bet,
    ]:
        print(f"  • {fn.slug}")
