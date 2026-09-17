"""Companion helpers: `shortlist_tools` and `confidence_gate`. Both work with any provider."""

from __future__ import annotations

import copy
import math
import threading
import typing as t

from composio.client.types import Tool
from composio.core.models._modifiers import ToolExecuteParams

from .compile import ROUTING_QUESTION_ID, routing_description_of, routing_question
from .decide import (
    MAX_TOOLS,
    REQUEST_BUDGET_TOKENS,
    Ask,
    Plan,
    Questions,
    estimate_tokens,
    normalize_state,
    stable,
)
from .types import (
    TypesafeApiError,
    TypesafeAvailabilityReason,
    TypesafeBypassInfo,
    TypesafeGateBlockedError,
    TypesafeGateContext,
    TypesafeGateUnavailableError,
    TypesafeGateVetoError,
    TypesafeInvalidOptionsError,
    TypesafeJsonValue,
    TypesafeLimitError,
    TypesafeMalformedResponseError,
    TypesafeNoulQuestion,
    TypesafeProviderError,
    TypesafeShortlist,
    TypesafeState,
)


def _is_integer(value: t.Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def plan_shortlist(
    tools: t.Sequence[Tool],
    state: TypesafeState,
    k: int,
) -> Plan[TypesafeShortlist]:
    """Ranks raw tools against a state. Routing sees `request` only, never `context`."""
    if not _is_integer(k) or k < 0:
        raise TypesafeInvalidOptionsError("`k` must be a non-negative integer.")
    if len(tools) > MAX_TOOLS:
        raise TypesafeLimitError("tools")
    normalized = normalize_state(state)
    if k == 0 or len(tools) == 0 or len(normalized.request.strip()) == 0:
        return {"tools": [], "scores": []}

    # Routing needs the slug and the routing text only, so the argument schemas stay unread.
    routing = routing_question(
        [
            {"slug": tool.slug, "routingDescription": routing_description_of(tool)}
            for tool in tools
        ]
    )
    questions: Questions = {ROUTING_QUESTION_ID: routing["question"]}
    if estimate_tokens(normalized.request_only, questions) > REQUEST_BUDGET_TOKENS:
        raise TypesafeLimitError("request_budget")
    answers = yield (normalized.request_only, questions)
    route = answers.choices.get(ROUTING_QUESTION_ID)
    if route is None:
        raise TypesafeMalformedResponseError("missing_answer")

    ranked = sorted(
        (
            (-route.probabilities.get(routing["keys"][index], 0.0), index)
            for index in range(len(tools))
        )
    )[:k]
    return {
        "tools": [tools[index] for _, index in ranked],
        "scores": [
            {"slug": tools[index].slug, "score": -negated} for negated, index in ranked
        ],
    }


GATE_QUESTION_ID = "gate"

# Static text. The proposed call travels in state under `proposed_call`, so text an LLM
# wrote into the arguments never sits inside the question.
GATE_QUESTION: TypesafeNoulQuestion = {
    "type": "noul",
    "instructions": "Does running the tool in `proposed_call` with those arguments "
    "carry out what `request` asks for?",
    "criteria": {
        "true": "The proposed call does what the user asked for in `request`.",
        "false": "The proposed call does something the user did not ask for, or "
        "contradicts `request`.",
    },
}


_AVAILABILITY_REASONS: t.Tuple[TypesafeAvailabilityReason, ...] = (
    "timeout",
    "connection",
    "server_error",
    "rate_limit",
)


class GateModifier(t.Protocol):
    def __call__(
        self, tool: str, toolkit: str, params: ToolExecuteParams
    ) -> ToolExecuteParams: ...


def _stable_or_block(value: t.Any) -> TypesafeJsonValue:
    """A value that is not JSON blocks the call. Nothing is dropped or rewritten."""
    try:
        return stable(value)
    except TypesafeInvalidOptionsError:
        pass
    # Raised outside the `except` block, so the invalid-options error is not the context.
    raise TypesafeGateBlockedError("check_failed")


def _leaf_kind(value: t.Any) -> str:
    # JSON scalar kinds. `bool` is checked first, because it is an `int` subclass.
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (dict, list)):
        # Containers are compared structurally by the recursion, never by kind, so a
        # container at a scalar position (e.g. a redactor replacing a JSON null with
        # an object) cannot pass as a null-to-null mask.
        return "container"
    return "null"


def _assert_masking_only(original: t.Any, redacted: t.Any) -> None:
    """
    The redactor is a masker: the redacted arguments must have exactly the original's
    JSON structure, meaning the same key sets and the same array lengths, and every leaf
    replacement must keep the same scalar kind. Anything else blocks, because Jev would
    approve a call that differs from the one that runs.
    """
    if isinstance(original, list):
        if not isinstance(redacted, list) or len(redacted) != len(original):
            raise TypesafeGateBlockedError("check_failed")
        for entry, replacement in zip(original, redacted):
            _assert_masking_only(entry, replacement)
        return
    if isinstance(original, dict):
        if not isinstance(redacted, dict) or set(redacted) != set(original):
            raise TypesafeGateBlockedError("check_failed")
        for key, entry in original.items():
            _assert_masking_only(entry, redacted[key])
        return
    if _leaf_kind(original) != _leaf_kind(redacted):
        raise TypesafeGateBlockedError("check_failed")


def confidence_gate(
    *,
    ask: Ask,
    tools: t.Sequence[Tool],
    get_request: t.Callable[[TypesafeGateContext], str],
    get_context: t.Optional[
        t.Callable[[TypesafeGateContext], TypesafeJsonValue]
    ] = None,
    threshold: float = 0.7,
    on_unavailable: t.Literal["block", "allow"] = "block",
    on_bypass: t.Optional[t.Callable[[TypesafeBypassInfo], None]] = None,
    max_vetoes: int = 3,
    redact_arguments: t.Optional[
        t.Callable[[str, t.Dict[str, t.Any]], t.Dict[str, t.Any]]
    ] = None,
) -> GateModifier:
    """
    Builds a `before_execute` callable that asks Jev whether a proposed tool call matches
    the user's request. Create one gate per agent run and reuse it across that run's retries.
    """
    if (
        isinstance(threshold, bool)
        or not isinstance(threshold, (int, float))
        or math.isnan(threshold)
        or not 0 <= threshold <= 1
    ):
        raise TypesafeInvalidOptionsError(
            "The gate threshold must be a number from 0 to 1."
        )
    if not _is_integer(max_vetoes) or max_vetoes < 1:
        raise TypesafeInvalidOptionsError("`max_vetoes` must be a positive integer.")
    if on_unavailable not in ("block", "allow"):
        # A typo'd mode must never fail open at check time.
        raise TypesafeInvalidOptionsError(
            "`on_unavailable` must be 'block' or 'allow'."
        )
    by_slug = {tool.slug: tool for tool in tools}
    lock = threading.Lock()
    vetoes = 0

    def check(tool: str, toolkit: str, params: ToolExecuteParams) -> ToolExecuteParams:
        nonlocal vetoes
        # A hijacked LLM must not be able to vary arguments until one call passes.
        if vetoes >= max_vetoes:
            raise TypesafeGateBlockedError("max_vetoes")
        raw_tool = by_slug.get(tool)
        if raw_tool is None:
            raise TypesafeGateBlockedError("unknown_tool")

        context: TypesafeGateContext = {
            "tool_slug": tool,
            "toolkit_slug": toolkit,
            "params": params,
        }
        request = get_request(context)
        gate_context = None if get_context is None else get_context(context)
        call_arguments: t.Any = dict(params.get("arguments") or {})
        if redact_arguments is not None:
            # The redactor works on a deep copy, so one that edits in place cannot alter
            # the call that runs.
            copied: t.Any = None
            try:
                copied = copy.deepcopy(call_arguments)
            except Exception:
                pass
            if copied is None:
                raise TypesafeGateBlockedError("check_failed")
            # The originals are checked first: what the gate reads must be JSON in full.
            original_arguments = _stable_or_block(call_arguments)
            call_arguments = redact_arguments(raw_tool.slug, copied)
            if not isinstance(call_arguments, dict) or not all(
                isinstance(key, str) for key in call_arguments
            ):
                raise TypesafeGateBlockedError("check_failed")
            # Jev evaluates what is sent, and the original arguments run. The redactor
            # may only mask, so an approved call is exactly the call that executes.
            _assert_masking_only(original_arguments, _stable_or_block(call_arguments))
        description = getattr(raw_tool, "description", None)
        # Only the slug and the arguments are copied out of the execution parameters.
        # `user_id`, `connected_account_id`, and the custom auth fields never leave.
        payload: t.Dict[str, t.Any] = {
            "request": request,
            "proposed_call": {
                "tool": raw_tool.slug,
                "description": raw_tool.name if description is None else description,
                "arguments": call_arguments,
            },
        }
        if gate_context is not None:
            payload["context"] = gate_context
        state: TypesafeJsonValue = None
        try:
            state = stable(payload)
        except TypesafeInvalidOptionsError:
            pass
        # A call the gate cannot read in full is blocked, never sent with a value dropped.
        if state is None:
            raise TypesafeGateBlockedError("check_failed")
        questions: Questions = {GATE_QUESTION_ID: GATE_QUESTION}
        # Arguments are never truncated to fit.
        if estimate_tokens(state, questions) > REQUEST_BUDGET_TOKENS:
            raise TypesafeGateBlockedError("oversized_call")

        probability: t.Optional[float] = None
        failure: t.Optional[TypesafeProviderError] = None
        try:
            answer = ask(state, questions).nouls.get(GATE_QUESTION_ID)
            probability = None if answer is None else answer.noul
        except TypesafeProviderError as error:
            failure = error
        if failure is not None or probability is None:
            reason = next(
                (
                    known
                    for known in _AVAILABILITY_REASONS
                    if isinstance(failure, TypesafeApiError) and failure.reason == known
                ),
                None,
            )
            if reason is None:
                raise TypesafeGateBlockedError("check_failed")
            if on_unavailable == "block":
                raise TypesafeGateUnavailableError(reason)
            if on_bypass is not None:
                on_bypass({"tool_slug": raw_tool.slug, "reason": reason})
            return params

        if probability >= threshold:
            return params
        vetoes += 1
        raise TypesafeGateVetoError(probability, threshold)

    def gate(tool: str, toolkit: str, params: ToolExecuteParams) -> ToolExecuteParams:
        # The lock spans the whole check, request included. Checks on one gate run one at
        # a time, so a burst of parallel calls cannot get past the veto budget together.
        with lock:
            return check(tool, toolkit, params)

    return gate
