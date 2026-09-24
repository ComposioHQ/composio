"""x402 pay-per-call handling on the tool-execution path.

An ``HTTP 402 Payment Required`` tool response can carry an x402 ``accepts[]``
envelope: one or more named settlement schemes (a ``scheme``/``network``/``asset``
triple plus an amount and a destination), as defined by the x402 protocol
(https://x402.org).  When a Composio tool answers 402 like that, the agent
currently has no step to complete the handshake and retry -- it just fails.

This module plugs that gap without touching the core execution path:

* :func:`parse_x402_envelope` decodes a 402 response body (the x402 v2
  ``payment-required`` shape and the inline ``accepts[]`` shape) into typed,
  validated :class:`X402Envelope` objects.
* :func:`x402_after_execute` builds a Composio ``after_execute`` modifier.  When
  the tool response carries a valid envelope and a ``payer`` is configured, it
  asks the payer to settle the quoted amount and marks the response for a retry.
  When no payer applies, or the envelope is malformed, it surfaces a clear
  ``payment_required`` signal instead of a generic failure -- **no money moves
  automatically**.

The design deliberately keeps the payment primitive out of the model's hands:
``payer`` is an ordinary callback ``(envelope) -> PaymentAction`` that the
application supplies (a wallet SDK, a hardware signer, a Nano seed, ...).  The
modifier never fabricates a payment and never guesses at a destination.

Example (Nano/XNO payer via any wallet SDK that returns a block/hash):

    from composio.core.models.x402 import x402_after_execute, parse_x402_envelope

    def my_payer(env):
        # returns PaymentAction(payment_ref=<hash>, settled=True)
        ...

    # Apply only to HTTP tools that can answer 402:
    modifiers = [x402_after_execute(my_payer, toolkits=["http", "fetch"])]
    tools = composio.tools.get(user_id="default", toolkits=["http"], modifiers=modifiers)
"""

from __future__ import annotations

import dataclasses
import json
import typing as t

if t.TYPE_CHECKING:
    from ._modifiers import AfterExecute
    from .tools import ToolExecutionResponse

# ─────────────────────────────────────────────────────────────────────────────
# Envelope model
# ─────────────────────────────────────────────────────────────────────────────


@dataclasses.dataclass(frozen=True)
class X402Accept:
    """One settlement scheme named by an x402 ``accepts[]`` entry."""

    scheme: str
    network: str
    asset: str
    amount: t.Optional[str] = None
    pay_to: t.Optional[str] = None

    @property
    def key(self) -> str:
        """Stable identity used to pick a payer (scheme:network:asset)."""
        return f"{self.scheme}:{self.network}:{self.asset}"


@dataclasses.dataclass(frozen=True)
class X402Envelope:
    """A validated x402 payment envelope decoded from a 402 response."""

    accepts: t.Tuple[X402Accept, ...]
    price: t.Optional[str] = None
    pay_to: t.Optional[str] = None
    # Raw body that produced the envelope (for debugging / re-negotiation).
    raw: t.Optional[str] = None

    def offers(self, scheme: str, network: t.Optional[str] = None, asset: t.Optional[str] = None) -> t.Optional[X402Accept]:
        """Return the first accept matching the given scheme/network/asset, if any."""
        for acc in self.accepts:
            if acc.scheme != scheme:
                continue
            if network is not None and acc.network != network:
                continue
            if asset is not None and acc.asset != asset:
                continue
            return acc
        return None


class X402ParseError(ValueError):
    """Raised when a 402 response body is not a valid x402 envelope."""


# ─────────────────────────────────────────────────────────────────────────────
# Parsing
# ─────────────────────────────────────────────────────────────────────────────

_KNOWN_SCHEMES = ("exact",)


def _required_str(obj: t.Any, key: str, where: str) -> str:
    val = obj.get(key) if isinstance(obj, dict) else None
    if not isinstance(val, str) or not val:
        raise X402ParseError(f"{where}: expected non-empty string for {key!r}")
    return val


def _parse_accept(item: t.Any, where: str) -> X402Accept:
    if not isinstance(item, dict):
        raise X402ParseError(f"{where}: accepts[] entry is not an object")
    scheme = _required_str(item, "scheme", where)
    network = _required_str(item, "network", where)
    asset = _required_str(item, "asset", where)
    amount = item.get("amount")
    pay_to = item.get("payTo") or item.get("pay_to")
    return X402Accept(
        scheme=scheme,
        network=network,
        asset=asset,
        amount=amount if isinstance(amount, str) and amount else None,
        pay_to=pay_to if isinstance(pay_to, str) and pay_to else None,
    )


def parse_x402_envelope(body: t.Union[str, t.Dict[str, t.Any], bytes]) -> X402Envelope:
    """Parse an x402 payment envelope from a 402 response body.

    Accepts the raw JSON string, bytes, or an already-decoded dict.  Two shapes
    are supported:

    * x402 v2 ``payment-required``: ``{"x402Version": 2, "accepts": [...],
      "price_xno": "...", "pay_to": "..."}`` (and the generic ``price`` /
      ``payTo`` spellings).
    * inline ``accepts[]``: ``{"accepts": [...]}``.

    Raises :class:`X402ParseError` for anything that is not a well-formed
    envelope, so callers can fail cleanly (no payment) on malformed responses.
    """
    if isinstance(body, bytes):
        body = body.decode("utf-8", errors="replace")
    if isinstance(body, str):
        stripped = body.strip()
        if not stripped:
            raise X402ParseError("empty 402 body")
        try:
            obj = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise X402ParseError(f"402 body is not valid JSON: {exc}") from exc
    elif isinstance(body, dict):
        obj = body
    else:
        raise X402ParseError("402 body must be str, bytes or dict")

    if not isinstance(obj, dict):
        raise X402ParseError("402 body is not a JSON object")

    accepts_raw = obj.get("accepts") or obj.get("accepts[]")
    if not isinstance(accepts_raw, list) or not accepts_raw:
        raise X402ParseError("402 body carries no accepts[] envelope")
    if not all(isinstance(a, dict) for a in accepts_raw):
        raise X402ParseError("accepts[] contains a non-object entry")

    accepts = tuple(_parse_accept(a, "accepts") for a in accepts_raw)

    price = obj.get("price_xno") or obj.get("price") or obj.get("amount")
    pay_to = obj.get("pay_to") or obj.get("payTo")
    return X402Envelope(
        accepts=accepts,
        price=price if isinstance(price, str) and price else None,
        pay_to=pay_to if isinstance(pay_to, str) and pay_to else None,
        raw=body if isinstance(body, str) else json.dumps(obj),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Payment action + modifier
# ─────────────────────────────────────────────────────────────────────────────


@dataclasses.dataclass(frozen=True)
class PaymentAction:
    """The outcome of a payer settling an envelope (or refusing to)."""

    settled: bool
    payment_ref: t.Optional[str] = None
    message: t.Optional[str] = None


Payer = t.Callable[[X402Envelope], PaymentAction]


def _is_x402_response(response: "ToolExecutionResponse") -> t.Tuple[bool, t.Optional[t.Any]]:
    """Return (True, body) when the tool response signals a 402 payment is owed."""
    data = response.get("data") or {}
    # Composio may surface the HTTP status in data or the 402 body itself.
    if isinstance(data, dict):
        body = data.get("body", data)
        status = data.get("status") or data.get("status_code")
        if status in (402, "402"):
            return True, body
    # Direct body shape (HTTP tools that return the raw response).
    if isinstance(data, dict) and ("accepts" in data or "accepts[]" in data):
        return True, data
    return False, None


def x402_after_execute(
    payer: t.Optional[Payer] = None,
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> "AfterExecute | t.Callable[[Payer], AfterExecute]":
    """Build a Composio ``after_execute`` modifier for x402 pay-per-call tools.

    Given a ``payer`` callback ``(X402Envelope) -> PaymentAction``, returns a
    modifier to pass via ``tools.get(..., modifiers=[...])`` /
    ``tools.execute(..., modifiers=[...])``.  Behaviour:

    * If the tool response does **not** signal 402, it is returned untouched.
    * If it does and the envelope parses cleanly and a payer settles it, the
      response gains a ``payment_ref`` and ``_retry`` is set so the caller (or
      the agent) can retry the tool call.
    * If the envelope is malformed, or no payer is configured, or the payer
      refuses, the response is returned with a clear ``payment_required``
      marker -- **no money moves**.

    Called with no ``payer`` (or only ``tools``/``toolkits``), it returns a
    partial usable as a decorator: ``x402_after_execute(toolkits=["http"])(fn)``.
    """
    if payer is None and tools is None and toolkits is None:
        raise ValueError("provide a payer, or tools/toolkits to scope the modifier")

    import functools

    if payer is None:
        return functools.partial(x402_after_execute, tools=tools, toolkits=toolkits)

    def _modifier(tool: str, toolkit: str, response: "ToolExecutionResponse") -> "ToolExecutionResponse":
        is_402, body = _is_x402_response(response)
        if not is_402:
            return response

        try:
            envelope = parse_x402_envelope(body)
        except X402ParseError as exc:
            # Malformed envelope -> clear signal, no payment.
            return {
                **response,
                "data": {
                    **(response.get("data") or {}),
                    "payment_required": True,
                    "payment_error": f"malformed x402 envelope: {exc}",
                },
            }

        if payer is None:
            return {
                **response,
                "data": {
                    **(response.get("data") or {}),
                    "payment_required": True,
                    "payment_error": "x402 payment owed but no payer configured",
                },
            }

        action = payer(envelope)
        outcome = {
            **(response.get("data") or {}),
            "payment_required": not action.settled,
        }
        if action.payment_ref:
            outcome["payment_ref"] = action.payment_ref
        if action.message:
            outcome["payment_message"] = action.message
        if action.settled:
            outcome["_retry"] = True
        return {**response, "data": outcome}

    # Match the SDK's modifier factory shape: return a callable the caller can
    # pass through `after_execute(...)`.
    try:
        from ._modifiers import after_execute as _after_execute

        return t.cast("AfterExecute", _after_execute(_modifier, tools=tools, toolkits=toolkits))
    except Exception:
        # Fallback: return the raw callable so the module stays importable
        # even if the local import path changes.
        return t.cast("AfterExecute", _modifier)
