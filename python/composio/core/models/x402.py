"""x402 pay-per-call handling on the tool-execution path.

An ``HTTP 402 Payment Required`` tool response can carry an x402 ``accepts[]``
envelope: one or more named settlement schemes (a ``scheme``/``network``/``asset``
triple plus an amount and a destination), as defined by the x402 protocol
(https://x402.org).  When a Composio tool answers 402 like that, the agent
currently has no step to complete the handshake and retry -- it just fails.

This module plugs that gap without touching the core execution path:

* :func:`parse_x402_envelope` decodes a payment envelope -- from the x402 v2
  ``payment-required`` HTTP header **or** the inline ``accepts[]`` body shape --
  into typed, validated :class:`X402Envelope` objects.
* :func:`x402_after_execute` builds a Composio ``after_execute`` modifier.  When
  the tool response signals a payment is owed and a matching ``payer`` is
  configured, it asks the payer to settle the quoted amount and marks the
  response for a retry.  When no payer applies, or the envelope is malformed,
  it surfaces a clear ``payment_required`` signal instead of a generic failure
  -- **no money moves automatically**.

The design deliberately keeps the payment primitive out of the model's hands:
``payer`` is an ordinary callback ``(envelope) -> PaymentAction`` that the
application supplies (a wallet SDK, a hardware signer, a Nano seed, ...).  The
modifier never fabricates a payment and never guesses at a destination.

Contract note (why this is a *signal*, not a self-retrying loop): a Composio
``after_execute`` modifier runs once, after the tool has already executed, and
has no handle to re-invoke the tool (``tools.execute`` applies the modifier to
the finished result and returns it -- see ``tools.py``).  So on settlement this
modifier annotates the response with ``retry_required: true`` and a
``payment_ref``; the caller/agent performs the retry with the proof attached.
It never claims to have re-run the tool it cannot re-run.

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

import base64
import dataclasses
import json
import functools
import typing as t

from ._modifiers import after_execute

if t.TYPE_CHECKING:
    from .tools import ToolExecutionResponse

from ._modifiers import AfterExecute

# ─────────────────────────────────────────────────────────────────────────────
# Envelope model
# ─────────────────────────────────────────────────────────────────────────────


@dataclasses.dataclass(frozen=True)
class X402Accept:
    """One settlement scheme named by an x402 ``accepts[]`` entry."""

    scheme: str
    network: str
    asset: str
    amount: str
    pay_to: str

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
    # Raw body or header that produced the envelope (for debugging).
    raw: t.Optional[str] = None

    def offers(
        self, scheme: str, network: t.Optional[str] = None, asset: t.Optional[str] = None
    ) -> t.Optional[X402Accept]:
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
    """Raised when a 402 payload is not a valid, quoteable x402 envelope."""


# ─────────────────────────────────────────────────────────────────────────────
# Parsing
# ─────────────────────────────────────────────────────────────────────────────

_KNOWN_SCHEMES = ("exact",)

# Header names used by x402 v2 to carry the payment envelope out of band from
# the body (the ``payment-required`` response header).  Matched case-insensitively:
# the spec sends it as ``PAYMENT-REQUIRED``, while tool responses may preserve a
# server's original casing after JSON serialization.
_PAYMENT_REQUIRED_HEADERS = ("payment-required", "payment_required")


def _required_str(obj: t.Any, key: str, where: str) -> str:
    val = obj.get(key) if isinstance(obj, dict) else None
    if not isinstance(val, str) or not val:
        raise X402ParseError(f"{where}: expected non-empty string for {key!r}")
    return val


def _optional_str(obj: t.Any, *keys: str) -> t.Optional[str]:
    for key in keys:
        val = obj.get(key) if isinstance(obj, dict) else None
        if isinstance(val, str) and val:
            return val
    return None


def _parse_accept(item: t.Any, where: str) -> X402Accept:
    """Parse and strictly validate one ``accepts[]`` entry.

    A quoteable offer must carry an ``amount`` and a ``payTo`` destination; an
    accept missing either cannot produce a real payment and is rejected here so
    a malformed offer never reaches a payer (no money moves on bad data).
    """
    if not isinstance(item, dict):
        raise X402ParseError(f"{where}: accepts[] entry is not an object")
    scheme = _required_str(item, "scheme", where)
    network = _required_str(item, "network", where)
    asset = _required_str(item, "asset", where)
    amount = _required_str(item, "amount", where)
    pay_to = _optional_str(item, "payTo", "pay_to")
    if not pay_to:
        raise X402ParseError(f"{where}: accept for {scheme}:{network}:{asset} carries no payTo")
    return X402Accept(
        scheme=scheme,
        network=network,
        asset=asset,
        amount=amount,
        pay_to=pay_to,
    )


def _decode_payment_required_header(value: str) -> t.Dict[str, t.Any]:
    """Decode an x402 v2 ``payment-required`` header into a JSON object.

    The header value is a base64url-encoded JSON envelope per the x402 spec;
    a plain-JSON value is accepted too so implementations that send it raw work.
    """
    stripped = value.strip()
    if not stripped:
        raise X402ParseError("payment-required header is empty")
    data: t.Optional[t.Any] = None
    candidates = [stripped]
    try:
        # base64url (padded or not) is the spec form.
        decoded = base64.urlsafe_b64decode(stripped + "=" * (-len(stripped) % 4))
        candidates.append(decoded.decode("utf-8", errors="replace"))
    except Exception:
        pass
    for cand in candidates:
        try:
            parsed = json.loads(cand)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            data = parsed
            break
    if data is None:
        raise X402ParseError("payment-required header is not a JSON envelope")
    return t.cast(t.Dict[str, t.Any], data)


def parse_x402_envelope(
    body: t.Union[str, t.Dict[str, t.Any], bytes, None],
    *,
    payment_required_header: t.Optional[str] = None,
) -> X402Envelope:
    """Parse an x402 payment envelope from a 402 response.

    Accepts the raw JSON string, bytes, or an already-decoded dict for the
    *body*, plus an optional x402 v2 ``payment-required`` header value.  The
    header (base64url JSON) takes precedence when present; otherwise the body's
    inline ``accepts[]`` shape is used.

    Raises :class:`X402ParseError` for anything that is not a well-formed,
    quoteable envelope, so callers can fail cleanly (no payment) on malformed
    responses.
    """
    source: t.Optional[t.Any] = None
    raw: t.Optional[str] = None

    if payment_required_header:
        obj = _decode_payment_required_header(payment_required_header)
        source = obj
        raw = payment_required_header
    else:
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
            source = obj
            raw = stripped
        elif isinstance(body, dict):
            source = body
            raw = json.dumps(body)
        elif body is None:
            raise X402ParseError("no payment envelope in 402 response")
        else:
            raise X402ParseError("402 body must be str, bytes, dict or None")

    if not isinstance(source, dict):
        raise X402ParseError("payment envelope is not a JSON object")

    accepts_raw = source.get("accepts") or source.get("accepts[]")
    if not isinstance(accepts_raw, list) or not accepts_raw:
        raise X402ParseError("envelope carries no accepts[] array")
    if not all(isinstance(a, dict) for a in accepts_raw):
        raise X402ParseError("accepts[] contains a non-object entry")

    accepts = tuple(_parse_accept(a, "accepts") for a in accepts_raw)
    price = _optional_str(source, "price_xno", "price", "amount")
    pay_to = _optional_str(source, "pay_to", "payTo")
    return X402Envelope(accepts=accepts, price=price, pay_to=pay_to, raw=raw)


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


def _extract_body_and_header(
    response: "ToolExecutionResponse",
) -> t.Tuple[bool, t.Any, t.Optional[str]]:
    """Return (is_payment, body, payment_required_header).

    A response is treated as a payment request **only** on a transport-level
    signal the server actually sent: an HTTP ``402`` status or an x402
    ``payment-required`` header (matched case-insensitively, since the spec
    sends ``PAYMENT-REQUIRED``).  Body content alone -- however much it looks
    like an ``accepts`` envelope -- never counts as a payment request, because
    the body is fully controlled by the remote server we are calling: a
    malicious or compromised endpoint could answer a normal ``200 OK`` with
    ``{"accepts": [...], "x402Version": 2}`` and otherwise trip the payer into
    an unsolicited payment to an attacker-chosen destination.  The envelope is
    read from the body only after a real 402/header already signalled payment.
    """
    data = response.get("data") or {}
    if not isinstance(data, dict):
        return False, None, None

    status = data.get("status") or data.get("status_code")
    status_is_402 = status in (402, "402")

    headers = data.get("headers")
    header_offer: t.Optional[str] = None
    if isinstance(headers, dict):
        for key, val in headers.items():
            if not isinstance(key, str):
                continue
            if key.strip().lower() in _PAYMENT_REQUIRED_HEADERS:
                if isinstance(val, str) and val.strip():
                    header_offer = val
                break

    body = data.get("body")
    if isinstance(body, bytes):
        body = body.decode("utf-8", errors="replace")
    elif (
        isinstance(data, dict)
        and not isinstance(body, (str, dict))
        and ("accepts" in data or "accepts[]" in data or "x402Version" in data)
    ):
        body = data

    # Transport must have signalled payment.  Body content is never the trigger.
    if not (status_is_402 or header_offer is not None):
        return False, None, None

    return True, body, header_offer


_Unspecified = object()


def x402_after_execute(
    payer: t.Union[Payer, object] = _Unspecified,
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> "AfterExecute | t.Callable[[Payer], AfterExecute]":
    """Build a Composio ``after_execute`` modifier for x402 pay-per-call tools.

    Use it with a concrete ``payer`` to settle (returns the modifier directly):

        mod = x402_after_execute(my_payer, toolkits=["http"])

    Or scope-only, applied later as a decorator (the composio ``after_execute``
    shape), which also lets a no-payer modifier be built that merely *signals*
    ``payment_required`` without settling:

        x402_after_execute(toolkits=["http"])(my_payer)
        x402_after_execute(payer=None, toolkits=["http"])   # signals only

    Behaviour of the resulting modifier:

    * If the tool response does **not** signal a payment, it is returned
      untouched.
    * If it does and the envelope parses cleanly and a payer settles it, the
      response gains a ``payment_ref`` and ``retry_required: true`` -- the
      caller retries the tool with the proof attached (see the module contract
      note: an ``after_execute`` modifier cannot re-invoke the tool itself).
    * If the envelope is malformed, incomplete, or no payer settles it, the
      response is returned with a clear ``payment_required`` marker -- **no
      money moves**.
    """
    if payer is _Unspecified:
        if tools is None and toolkits is None:
            raise ValueError("provide a payer, or tools/toolkits to scope the modifier")
        # Scope-only: return a composio-style decorator that takes the payer.
        return t.cast(
            t.Callable[[Payer], AfterExecute],
            functools.partial(_build_modifier, tools=tools, toolkits=toolkits),
        )
    payer_fn = t.cast(t.Optional[Payer], payer) if payer is not None else None
    return _build_modifier(payer_fn, tools=tools, toolkits=toolkits)


def _build_modifier(
    payer: t.Optional[Payer],
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> "AfterExecute":
    """Wrap the inner modifier function as a Composio ``after_execute`` modifier."""
    return t.cast(
        "AfterExecute",
        after_execute(_modifier(payer), tools=tools, toolkits=toolkits),
    )


def _modifier(payer: t.Optional[Payer]) -> t.Callable[[str, str, "ToolExecutionResponse"], "ToolExecutionResponse"]:
    def _apply(
        tool: str, toolkit: str, response: "ToolExecutionResponse"
    ) -> "ToolExecutionResponse":
        is_402, body, header_offer = _extract_body_and_header(response)
        if not is_402:
            return response

        try:
            envelope = parse_x402_envelope(
                body, payment_required_header=header_offer
            )
        except X402ParseError as exc:
            # Malformed/incomplete envelope -> clear signal, no payment.
            return {
                **response,
                "data": {
                    **(response.get("data") or {}),
                    "payment_required": True,
                    "payment_error": f"malformed x402 envelope: {exc}",
                },
            }

        if payer is None:
            # No payer configured: report the debt, move no money.
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
            # after_execute cannot re-invoke the tool; it signals the caller to
            # retry with the proof attached. See the module contract note.
            outcome["retry_required"] = True
        return {**response, "data": outcome}

    return _apply
