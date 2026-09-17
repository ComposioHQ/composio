"""`decide`: request strategy, validation, and confidence."""

from __future__ import annotations

import asyncio
import dataclasses
import inspect
import json
import math
import typing as t

from pydantic import BaseModel, ConfigDict, StrictStr
from pydantic import ValidationError as PydanticValidationError

from .compile import ROUTING_QUESTION_ID, by_code_unit, routing_question
from .keys import NONE_KEY, option_values
from .response import (
    ValidatedAnswers,
    is_size_rejection,
    read_request_id,
    to_provider_error,
    validate_answers,
)
from .types import (
    Probability,
    TypesafeAbstainDecision,
    TypesafeAbstainReason,
    TypesafeArgumentQuestion,
    TypesafeCandidate,
    TypesafeClientLike,
    TypesafeContextScope,
    TypesafeDecision,
    TypesafeDecisionMeta,
    TypesafeInvalidOptionsError,
    TypesafeJsonValue,
    TypesafeJudgement,
    TypesafeLimitError,
    TypesafeMalformedResponseError,
    TypesafeNoulCriteria,
    TypesafeNoulQuestion,
    TypesafeProviderError,
    TypesafeQuestion,
    TypesafeState,
    TypesafeThresholds,
    TypesafeToolQuestions,
    TypesafeToolSet,
)

# A routing Choice holds every tool plus the none option, and a Choice takes 255 options.
MAX_TOOLS = 254

# A margin below the documented 32k tokens for state plus the longest question.
REQUEST_BUDGET_TOKENS = 24_000

DEFAULT_MODEL = "jev-latest"
DEFAULT_THRESHOLDS: TypesafeThresholds = {"routing": 0.6, "gate": 0.3, "argument": 0.6}
DESTRUCTIVE_ROUTING_THRESHOLD = 0.9

# Yes means "the user asks to perform an action now". A negated instruction must read as no.
_GATE_CRITERIA: TypesafeNoulCriteria = {
    "true": "The user tells the assistant to carry out an action now.",
    "false": "The user asks a question, asks for an explanation, describes something, "
    "or says not to do something.",
}
GATE_QUESTIONS: t.Tuple[TypesafeNoulQuestion, ...] = (
    {
        "type": "noul",
        "instructions": "Is the user asking for an action to be performed now?",
        "criteria": _GATE_CRITERIA,
    },
    {
        "type": "noul",
        "instructions": "Does the user instruct the assistant to do something, rather "
        "than ask how something works?",
        "criteria": _GATE_CRITERIA,
    },
    {
        "type": "noul",
        "instructions": "Should a tool be run right now to satisfy this request?",
        "criteria": _GATE_CRITERIA,
    },
)


# A literal, so `tests/test_path_join_guardrail.py` can tell the mean from a path join.
GATE_QUESTION_COUNT = 3


def _gate_id(index: int) -> str:
    return f"gate_{index}"


# ---------------------------------------------------------------------------
# Options and state
# ---------------------------------------------------------------------------


class _Thresholds(BaseModel):
    model_config = ConfigDict(extra="forbid")

    routing: t.Optional[Probability] = None
    gate: t.Optional[Probability] = None
    argument: t.Optional[Probability] = None


@dataclasses.dataclass(frozen=True)
class DecideSettings:
    thresholds: t.Optional[TypesafeThresholds] = None
    context_scope: t.Optional[TypesafeContextScope] = None

    def __post_init__(self) -> None:
        """Raises on a threshold that is NaN or outside 0-1, and on an unknown scope."""
        valid = True
        try:
            _Thresholds.model_validate(self.thresholds or {})
        except PydanticValidationError:
            valid = False
        if not valid:
            raise TypesafeInvalidOptionsError(
                "Every threshold must be a number from 0 to 1."
            )
        # An exact match: any other value would send `context` to routing and the gate.
        if self.context_scope not in (None, "arguments", "all"):
            raise TypesafeInvalidOptionsError(
                "`context_scope` must be `arguments` or `all`."
            )


class _RequestState(BaseModel):
    # A misspelled `context` would otherwise be dropped without a word.
    model_config = ConfigDict(extra="forbid")

    request: StrictStr
    context: t.Any = None


_NOT_JSON = (
    "State holds a value that is not JSON. Serialize dates, big integers, and binary "
    "data before passing them."
)


def _rebuild(value: t.Any) -> TypesafeJsonValue:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    if isinstance(value, (list, tuple)):
        return [_rebuild(entry) for entry in value]
    if isinstance(value, t.Mapping) and all(isinstance(key, str) for key in value):
        return {key: _rebuild(value[key]) for key in sorted(value, key=by_code_unit)}
    # The message is static: the value itself never reaches an error.
    raise TypesafeInvalidOptionsError(_NOT_JSON)


def stable(value: t.Any) -> TypesafeJsonValue:
    """
    Rebuilds a JSON value with sorted object keys, so equal states serialize identically.

    :raises TypesafeInvalidOptionsError: on a value that is not JSON, a value that
        contains itself included. Nothing is dropped or replaced, because what Jev reads
        must be what the caller passed.
    """
    rebuilt: TypesafeJsonValue = None
    cyclic = False
    try:
        rebuilt = _rebuild(value)
    except RecursionError:
        cyclic = True
    if cyclic:
        raise TypesafeInvalidOptionsError(_NOT_JSON)
    return rebuilt


@dataclasses.dataclass(frozen=True)
class NormalizedState:
    request: str
    request_only: TypesafeJsonValue
    """What routing and the action gate see."""
    full: TypesafeJsonValue
    """What argument questions see."""
    has_context: bool


def normalize_state(state: TypesafeState) -> NormalizedState:
    if isinstance(state, str):
        return NormalizedState(state, state, state, False)
    parsed: t.Optional[_RequestState] = None
    try:
        parsed = _RequestState.model_validate(state)
    except PydanticValidationError:
        pass
    if parsed is None:
        raise TypesafeInvalidOptionsError(
            "State must be a string or an object with a string `request` and an "
            "optional `context`. Other top-level keys are not sent, so they are rejected."
        )
    request = parsed.request
    has_context = parsed.context is not None
    return NormalizedState(
        request=request,
        request_only={"request": request},
        full={"context": stable(parsed.context), "request": request}
        if has_context
        else {"request": request},
        has_context=has_context,
    )


def _compact(value: t.Any) -> str:
    # Compact separators and raw Unicode match JavaScript's `JSON.stringify`.
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def estimate_tokens(
    state: TypesafeJsonValue, questions: t.Mapping[str, TypesafeQuestion]
) -> int:
    """Characters divided by 4."""
    return math.ceil((len(_compact(state)) + len(_compact(questions))) / 4)


# ---------------------------------------------------------------------------
# Asking
# ---------------------------------------------------------------------------

Questions = t.Dict[str, TypesafeQuestion]
Ask = t.Callable[[TypesafeJsonValue, Questions], ValidatedAnswers]
AsyncAsk = t.Callable[[TypesafeJsonValue, Questions], t.Awaitable[ValidatedAnswers]]

_SYNC_CLIENT_NEEDED = (
    "The TypeSafe client is asynchronous. Use `adecide`, or pass a synchronous client."
)


def _request_kwargs(model: str, timeout: t.Optional[float]) -> t.Dict[str, t.Any]:
    return {"model": model} if timeout is None else {"model": model, "timeout": timeout}


def _settle(
    response: t.Any,
    failure: t.Optional[TypesafeProviderError],
    questions: Questions,
) -> ValidatedAnswers:
    # Raised outside the `except` block, so the SDK exception is neither the cause nor
    # the context of the provider error.
    if failure is not None:
        raise failure
    return validate_answers(response, questions, read_request_id(response))


def create_ask(
    get_client: t.Callable[[], TypesafeClientLike],
    model: str,
    timeout: t.Optional[float] = None,
) -> Ask:
    """One validated round trip. Every failure leaves as a provider error with safe diagnostics."""

    def ask(state: TypesafeJsonValue, questions: Questions) -> ValidatedAnswers:
        client = get_client()
        response: t.Any = None
        failure: t.Optional[TypesafeProviderError] = None
        try:
            response = client.system_one(
                state=state, questions=questions, **_request_kwargs(model, timeout)
            )
        except Exception as error:
            failure = to_provider_error(error)
        if inspect.isawaitable(response):
            if inspect.iscoroutine(response):
                response.close()
            raise TypesafeInvalidOptionsError(_SYNC_CLIENT_NEEDED)
        return _settle(response, failure, questions)

    return ask


def create_async_ask(
    get_client: t.Callable[[], TypesafeClientLike],
    model: str,
    timeout: t.Optional[float] = None,
) -> AsyncAsk:
    """The asynchronous round trip. A synchronous client runs in a worker thread."""

    async def ask(state: TypesafeJsonValue, questions: Questions) -> ValidatedAnswers:
        client = get_client()
        kwargs = _request_kwargs(model, timeout)
        response: t.Any = None
        failure: t.Optional[TypesafeProviderError] = None
        try:
            if inspect.iscoroutinefunction(client.system_one):
                response = await client.system_one(
                    state=state, questions=questions, **kwargs
                )
            else:
                response = await asyncio.to_thread(
                    lambda: client.system_one(
                        state=state, questions=questions, **kwargs
                    )
                )
                if inspect.isawaitable(response):
                    response = await response
        except Exception as error:
            failure = to_provider_error(error)
        return _settle(response, failure, questions)

    return ask


# ---------------------------------------------------------------------------
# Plans
#
# A plan is a generator that yields the requests it needs and receives their validated
# answers. `decide` and `adecide` drive the same plan, so they cannot drift apart.
# ---------------------------------------------------------------------------

_Result = t.TypeVar("_Result")
Exchange = t.Tuple[TypesafeJsonValue, Questions]
Plan = t.Generator[Exchange, ValidatedAnswers, _Result]


def run_plan(plan: Plan[_Result], ask: Ask) -> _Result:
    try:
        exchange = next(plan)
    except StopIteration as done:
        return t.cast(_Result, done.value)
    while True:
        answers: t.Optional[ValidatedAnswers] = None
        failure: t.Optional[TypesafeProviderError] = None
        try:
            answers = ask(*exchange)
        except TypesafeProviderError as error:
            failure = error
        try:
            exchange = (
                plan.send(t.cast(ValidatedAnswers, answers))
                if failure is None
                else plan.throw(failure)
            )
        except StopIteration as done:
            return t.cast(_Result, done.value)


async def run_plan_async(plan: Plan[_Result], ask: AsyncAsk) -> _Result:
    try:
        exchange = next(plan)
    except StopIteration as done:
        return t.cast(_Result, done.value)
    while True:
        answers: t.Optional[ValidatedAnswers] = None
        failure: t.Optional[TypesafeProviderError] = None
        try:
            answers = await ask(*exchange)
        except TypesafeProviderError as error:
            failure = error
        try:
            exchange = (
                plan.send(t.cast(ValidatedAnswers, answers))
                if failure is None
                else plan.throw(failure)
            )
        except StopIteration as done:
            return t.cast(_Result, done.value)


# ---------------------------------------------------------------------------
# Deciding
# ---------------------------------------------------------------------------


@dataclasses.dataclass(frozen=True)
class DecideOptions(DecideSettings):
    arguments: t.Optional[t.Mapping[str, t.Any]] = None
    """Values the caller already knows. They get no question and do not affect confidence."""


def _tool_prefix(tool_index: int) -> str:
    return f"t{tool_index}_"


def _argument_questions(
    tool: TypesafeToolQuestions, tool_index: int, prefilled: t.Collection[str]
) -> Questions:
    questions: Questions = {}
    prefix = _tool_prefix(tool_index)
    for argument in tool["arguments"]:
        if argument["name"] in prefilled:
            continue
        if argument["kind"] == "choice":
            questions[prefix + argument["questionId"]] = argument["question"]
            continue
        questions[prefix + argument["mentionedId"]] = argument["mentioned"]
        for member in argument["members"]:
            questions[prefix + member["questionId"]] = member["question"]
    return questions


@dataclasses.dataclass(frozen=True)
class _Stated:
    value: t.Any
    score: float


def _read_argument(
    argument: TypesafeArgumentQuestion, prefix: str, answers: ValidatedAnswers
) -> t.Optional[_Stated]:
    """The stated value and its score, or `None` when the request does not state one."""
    if argument["kind"] == "choice":
        answer = answers.choices.get(prefix + argument["questionId"])
        if answer is None or answer.choice == argument["notStatedKey"]:
            return None
        values = option_values(argument["options"])
        if answer.choice not in values:
            return None
        return _Stated(values[answer.choice], answer.confidence)

    def probability(question_id: str) -> float:
        noul = answers.nouls.get(prefix + question_id)
        return 0.0 if noul is None else noul.noul

    mentioned = probability(argument["mentionedId"])
    if mentioned < 0.5:
        return None
    members = [
        (index, member["value"], probability(member["questionId"]))
        for index, member in enumerate(argument["members"])
    ]
    selected = sorted(
        (member for member in members if member[2] >= 0.5),
        key=lambda member: (-member[2], member[0]),
    )
    if "maxItems" in argument:
        selected = selected[: int(argument["maxItems"])]
    # An undersized selection is not what the request stated, so nothing is bound.
    if len(selected) < argument.get("minItems", 0):
        return None
    score = min([mentioned, *(max(p, 1 - p) for _, _, p in members)])
    # The output keeps the declared order of the members.
    return _Stated([value for _, value, _ in sorted(selected)], score)


def _resolve_thresholds(
    tool: t.Optional[TypesafeToolQuestions],
    provider: DecideSettings,
    call: DecideSettings,
) -> t.Dict[str, float]:
    # A threshold of `None` reads as an omitted key, so it never erases the layer below.
    layers = (DEFAULT_THRESHOLDS, provider.thresholds, call.thresholds)
    thresholds: t.Dict[str, float] = {
        name: t.cast(float, value)
        for layer in layers
        for name, value in (layer or {}).items()
        if value is not None
    }
    # No threshold lowers a destructive tool's routing floor.
    if tool is not None and tool["risk"] == "destructive":
        thresholds["routing"] = max(
            thresholds["routing"], DESTRUCTIVE_ROUTING_THRESHOLD
        )
    return thresholds


def plan_decision(
    tool_set: TypesafeToolSet,
    state: TypesafeState,
    settings: DecideSettings,
    options: DecideOptions,
) -> Plan[TypesafeDecision]:
    normalized = normalize_state(state)
    meta: TypesafeDecisionMeta = {
        "model": None,
        "request_ids": [],
        "strategy": "none",
        "request_count": 0,
    }

    def abstain(
        reason: TypesafeAbstainReason,
        candidates: t.Optional[t.List[TypesafeCandidate]] = None,
        confidence: float = 0.0,
    ) -> TypesafeAbstainDecision:
        return {
            "kind": "abstain",
            "reason": reason,
            "candidates": candidates or [],
            "confidence": confidence,
            "meta": meta,
        }

    def exchange(
        request_state: TypesafeJsonValue, questions: Questions
    ) -> Plan[ValidatedAnswers]:
        # A failed request counts. A malformed response still carries its request ID.
        try:
            answers = yield (request_state, questions)
        except TypesafeProviderError as error:
            meta["request_count"] += 1
            request_id = getattr(error, "request_id", None)
            if isinstance(error, TypesafeMalformedResponseError) and request_id:
                meta["request_ids"].append(request_id)
            raise
        meta["request_count"] += 1
        if answers.request_id is not None:
            meta["request_ids"].append(answers.request_id)
        return answers

    tools = tool_set["tools"]
    if len(tools) == 0:
        return abstain("no_tools")
    if len(normalized.request.strip()) == 0:
        return abstain("empty_state")
    if len(tools) > MAX_TOOLS:
        raise TypesafeLimitError("tools")

    routing = routing_question(tools)
    route_questions: Questions = {ROUTING_QUESTION_ID: routing["question"]}
    for index, gate_question in enumerate(GATE_QUESTIONS):
        route_questions[_gate_id(index)] = gate_question

    context_scope = options.context_scope or settings.context_scope or "arguments"
    # Routing and the gate never see `context` unless the caller opts in. The split is
    # structural: Jev is not an LLM, so telling it to ignore `context` is not a control.
    split_context = normalized.has_context and context_scope == "arguments"
    route_state = normalized.request_only if split_context else normalized.full
    if estimate_tokens(route_state, route_questions) > REQUEST_BUDGET_TOKENS:
        raise TypesafeLimitError("request_budget")

    prefilled = dict(options.arguments or {})

    answers: t.Optional[ValidatedAnswers] = None
    argument_answers: t.Optional[ValidatedAnswers] = None

    if not split_context:
        fan_out: Questions = dict(route_questions)
        for index, candidate in enumerate(tools):
            fan_out.update(_argument_questions(candidate, index, prefilled))
        if estimate_tokens(normalized.full, fan_out) <= REQUEST_BUDGET_TOKENS:
            try:
                answers = yield from exchange(normalized.full, fan_out)
                argument_answers = answers
                meta["strategy"] = "fan_out"
            except TypesafeProviderError as error:
                # The estimate undercounted. Fall back to route-first once; a second
                # rejection raises.
                if not is_size_rejection(error):
                    raise
    if answers is None:
        meta["strategy"] = "route_then_arguments"
        answers = yield from exchange(route_state, route_questions)
    meta["model"] = answers.model

    route = answers.choices.get(ROUTING_QUESTION_ID)
    if route is None:
        raise TypesafeMalformedResponseError("missing_answer")
    ranked = sorted(
        (
            (-route.probabilities.get(routing["keys"][index], 0.0), index, tool["slug"])
            for index, tool in enumerate(tools)
        ),
    )
    candidates: t.List[TypesafeCandidate] = [
        {"tool": slug, "probability": -negated} for negated, _, slug in ranked
    ]
    if route.choice == NONE_KEY:
        top_confidence = candidates[0]["probability"] if candidates else 0.0
    else:
        top_confidence = route.confidence

    gate_scores = [
        answers.nouls[_gate_id(index)].noul if _gate_id(index) in answers.nouls else 0.0
        for index in range(len(GATE_QUESTIONS))
    ]
    # The gate contributes its probability directly, so a confident "no action" abstains.
    gate = sum(gate_scores) / GATE_QUESTION_COUNT

    tool_index = (
        routing["keys"].index(route.choice) if route.choice in routing["keys"] else -1
    )
    tool = None if tool_index == -1 else tools[tool_index]
    thresholds = _resolve_thresholds(tool, settings, options)

    if gate < thresholds["gate"]:
        return abstain("no_action_requested", candidates, top_confidence)
    if tool is None:
        return abstain("none_fit", candidates, top_confidence)
    if route.confidence < thresholds["routing"]:
        return abstain("low_confidence", candidates, top_confidence)

    if "version" in tool:
        meta["tool_version"] = tool["version"]
    if argument_answers is None:
        questions = _argument_questions(tool, tool_index, prefilled)
        if questions:
            if estimate_tokens(normalized.full, questions) > REQUEST_BUDGET_TOKENS:
                raise TypesafeLimitError("request_budget")
            argument_answers = yield from exchange(normalized.full, questions)

    judgements: t.List[TypesafeJudgement] = [
        {"kind": "routing", "score": route.confidence, "required": True},
        {"kind": "gate", "score": gate, "required": True},
    ]
    bound: t.Dict[str, t.Any] = {}
    suggestions: t.Dict[str, t.Any] = {}
    dropped: t.List[t.List[str]] = []
    prefix = _tool_prefix(tool_index)

    for argument in tool["arguments"]:
        if argument["name"] in prefilled or argument_answers is None:
            continue
        stated = _read_argument(argument, prefix, argument_answers)
        if stated is None:
            continue
        confident = stated.score >= thresholds["argument"]
        judgements.append(
            {
                "kind": "argument",
                "path": [argument["name"]],
                "score": stated.score,
                # A judgement counts toward the call confidence only when the call
                # depends on it.
                "required": argument["required"] and confident,
            }
        )
        if confident:
            bound[argument["name"]] = stated.value
        elif argument["required"]:
            suggestions[argument["name"]] = stated.value
        else:
            dropped.append([argument["name"]])

    missing = [
        [name]
        for name in tool["required"]
        if name not in bound and name not in prefilled
    ]
    shared: t.Dict[str, t.Any] = {
        "tool": tool["slug"],
        "arguments": {**bound, **prefilled},
        "dropped": dropped,
        "confidence": min(j["score"] for j in judgements if j["required"]),
        "judgements": judgements,
        "risk": tool["risk"],
        "requires_confirmation": tool["risk"] == "destructive",
        "meta": meta,
    }
    if not missing:
        return t.cast(TypesafeDecision, {"kind": "call", **shared})
    return t.cast(
        TypesafeDecision,
        {"kind": "partial", **shared, "missing": missing, "suggestions": suggestions},
    )
