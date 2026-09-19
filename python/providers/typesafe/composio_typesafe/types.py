"""Public types and errors of the TypeSafe (Jev) provider."""

from __future__ import annotations

import typing as t

import typing_extensions as te
from pydantic import BeforeValidator, ConfigDict, Field, TypeAdapter, with_config
from pydantic import ValidationError as PydanticValidationError

from composio.client.types import Tool
from composio.core.models._modifiers import ToolExecuteParams
from composio.exceptions import ComposioError

# ---------------------------------------------------------------------------
# TypeSafe client boundary
# ---------------------------------------------------------------------------

TypesafeJsonValue: te.TypeAlias = t.Union[
    str,
    int,
    float,
    bool,
    None,
    t.Sequence["TypesafeJsonValue"],
    t.Mapping[str, "TypesafeJsonValue"],
]
"""A JSON-compatible value."""


class TypesafeNoulCriteria(te.TypedDict, total=False):
    true: str
    false: str


class TypesafeNoulQuestion(te.TypedDict):
    """A yes/no question."""

    type: t.Literal["noul"]
    instructions: str
    criteria: te.NotRequired[TypesafeNoulCriteria]


class TypesafeChoiceQuestion(te.TypedDict):
    """A question that selects one option key."""

    type: t.Literal["choice"]
    instructions: str
    criteria: t.Dict[str, str]


TypesafeQuestion: te.TypeAlias = t.Union[TypesafeNoulQuestion, TypesafeChoiceQuestion]


class TypesafeClientLike(t.Protocol):
    """
    The part of ``TypeSafeClient`` or ``AsyncTypeSafeClient`` from ``typesafe-sdk``
    that the provider uses. An injected client only has to satisfy this shape.
    ``decide`` needs a synchronous ``system_one``; ``adecide`` accepts either.
    """

    @property
    def system_one(self) -> t.Callable[..., t.Any]: ...


# ---------------------------------------------------------------------------
# Compiled tools
#
# The compiled tool set keeps the field names of the TypeScript SDK. Both SDKs
# compile the same tool into the same questions, and one fixture corpus proves it.
# ---------------------------------------------------------------------------

TypesafeRisk: te.TypeAlias = t.Literal["read_only", "mutating", "destructive"]
"""Risk class derived from Composio's tool tags."""

TypesafeOptionValue: te.TypeAlias = t.Union[str, int, bool, None]
"""A closed-set value Jev can bind."""


class TypesafeOption(te.TypedDict):
    """One option of a compiled Choice. ``key`` is what Jev sees; ``value`` is what the tool receives."""

    key: str
    value: TypesafeOptionValue


class TypesafeChoiceArgument(te.TypedDict):
    """An enum or boolean argument, asked as one Choice with a not-stated option."""

    kind: t.Literal["choice"]
    name: str
    required: bool
    questionId: str
    question: TypesafeChoiceQuestion
    options: t.List[TypesafeOption]
    notStatedKey: str


class TypesafeArrayMember(te.TypedDict):
    questionId: str
    value: t.Union[str, int]
    question: TypesafeNoulQuestion


class TypesafeArrayArgument(te.TypedDict):
    """An array-of-enum argument, asked as one "mentioned" Noul plus one Noul per member."""

    kind: t.Literal["array"]
    name: str
    required: bool
    mentionedId: str
    mentioned: TypesafeNoulQuestion
    members: t.List[TypesafeArrayMember]
    maxItems: te.NotRequired[int]
    minItems: te.NotRequired[int]
    """A selection with fewer members than this is not stated, so the argument stays missing."""


TypesafeArgumentQuestion: te.TypeAlias = t.Union[
    TypesafeChoiceArgument, TypesafeArrayArgument
]


class TypesafeToolQuestions(te.TypedDict):
    """A Composio tool compiled into Jev questions. Plain JSON."""

    slug: str
    name: str
    routingDescription: str
    """The text of this tool's option in the routing Choice."""
    version: te.NotRequired[str]
    risk: TypesafeRisk
    arguments: t.List[TypesafeArgumentQuestion]
    """One entry per closed-set argument, sorted by argument name."""
    openEnded: t.List[str]
    """Open-ended argument names. Jev never writes these."""
    required: t.List[str]
    """Required argument names."""


class TypesafeToolSet(te.TypedDict):
    """What ``composio.tools.get()`` returns with this provider. Plain JSON."""

    tools: t.List[TypesafeToolQuestions]


# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------


class TypesafeThresholds(te.TypedDict, total=False):
    routing: float
    """Minimum routing confidence. Default 0.6, and 0.9 for a destructive tool."""
    gate: float
    """Minimum mean of the "is an action requested" Nouls. Default 0.3."""
    argument: float
    """Minimum confidence to bind an argument. Default 0.6."""


TypesafeContextScope: te.TypeAlias = t.Literal["arguments", "all"]


class TypesafeRequestState(te.TypedDict):
    request: str
    context: te.NotRequired[TypesafeJsonValue]


TypesafeState: te.TypeAlias = t.Union[str, TypesafeRequestState]
"""A plain request, or a request with supporting context."""

# ---------------------------------------------------------------------------
# Decisions
# ---------------------------------------------------------------------------


def _json_number(value: t.Any) -> t.Any:
    """
    Accepts a JSON number and returns it as a float, so a whole number on the wire (``0``
    or ``1``) is valid. ``bool`` is an ``int`` subclass, so it is rejected here.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("expected a JSON number")
    return float(value)


Probability = te.Annotated[
    float,
    BeforeValidator(_json_number),
    Field(ge=0, le=1, allow_inf_nan=False),
]
_Path = te.Annotated[t.List[str], Field(min_length=1)]
# Pydantic validates a stored decision against these same TypedDicts, strictly.
_STRICT = ConfigDict(strict=True)


@with_config(_STRICT)
class TypesafeJudgement(te.TypedDict):
    kind: t.Literal["routing", "gate", "argument"]
    path: te.NotRequired[_Path]
    score: Probability
    required: bool


@with_config(_STRICT)
class TypesafeDecisionMeta(te.TypedDict):
    model: t.Optional[str]
    request_ids: t.List[str]
    strategy: t.Literal["none", "fan_out", "route_then_arguments"]
    request_count: te.Annotated[int, Field(ge=0)]
    tool_version: te.NotRequired[str]


class _BoundDecision(te.TypedDict):
    """What a `call` and a `partial` share: the tool and the arguments Jev bound."""

    tool: te.Annotated[str, Field(min_length=1)]
    arguments: t.Dict[str, t.Any]
    dropped: t.List[_Path]
    """Optional arguments dropped because their answer was below the argument threshold."""
    confidence: Probability
    judgements: t.List[TypesafeJudgement]
    risk: TypesafeRisk
    requires_confirmation: bool
    meta: TypesafeDecisionMeta


@with_config(_STRICT)
class TypesafeCallDecision(_BoundDecision):
    kind: t.Literal["call"]


@with_config(_STRICT)
class TypesafePartialDecision(_BoundDecision):
    kind: t.Literal["partial"]
    missing: t.List[_Path]
    suggestions: t.Dict[str, t.Any]
    """Low-confidence guesses for required arguments, keyed by argument name."""


@with_config(_STRICT)
class TypesafeCandidate(te.TypedDict):
    tool: str
    probability: Probability


TypesafeAbstainReason: te.TypeAlias = t.Literal[
    "no_tools", "empty_state", "none_fit", "no_action_requested", "low_confidence"
]


@with_config(_STRICT)
class TypesafeAbstainDecision(te.TypedDict):
    kind: t.Literal["abstain"]
    reason: TypesafeAbstainReason
    candidates: t.List[TypesafeCandidate]
    confidence: Probability
    meta: TypesafeDecisionMeta


TypesafeDecision: te.TypeAlias = t.Union[
    TypesafeCallDecision, TypesafePartialDecision, TypesafeAbstainDecision
]

_DECISION: TypeAdapter[TypesafeDecision] = TypeAdapter(
    te.Annotated[TypesafeDecision, Field(discriminator="kind")]
)


def parse_decision(value: t.Any) -> TypesafeDecision:
    """
    Parses a decision that was stored or sent over the wire.

    :raises TypesafeMalformedDecisionError: when the value is not a decision.
    """
    parsed: t.Optional[TypesafeDecision] = None
    try:
        parsed = _DECISION.validate_python(value)
    except PydanticValidationError:
        # The validation error quotes its input, so it is never chained or kept.
        pass
    if parsed is None:
        raise TypesafeMalformedDecisionError()
    return parsed


# ---------------------------------------------------------------------------
# Companion helpers
# ---------------------------------------------------------------------------


class TypesafeShortlistScore(te.TypedDict):
    slug: str
    score: float


class TypesafeShortlist(te.TypedDict):
    tools: t.List[Tool]
    """The top ``k`` raw tools, best first."""
    scores: t.List[TypesafeShortlistScore]


class TypesafeGateContext(te.TypedDict):
    tool_slug: str
    toolkit_slug: str
    params: ToolExecuteParams


TypesafeAvailabilityReason: te.TypeAlias = t.Literal[
    "connection", "timeout", "server_error", "rate_limit"
]


class TypesafeBypassInfo(te.TypedDict):
    tool_slug: str
    reason: TypesafeAvailabilityReason


# ---------------------------------------------------------------------------
# Errors
#
# Messages are static templates plus a status code and a request ID. No error
# holds state, argument values, response content, or the SDK's own exception,
# and none is raised with a `__cause__` or a `__context__`.
# ---------------------------------------------------------------------------


def _describe_diagnostics(status: t.Optional[int], request_id: t.Optional[str]) -> str:
    return ("" if status is None else f" (status {status})") + (
        f" [request {request_id}]" if request_id else ""
    )


class TypesafeProviderError(ComposioError):
    code: t.ClassVar[str] = "TYPESAFE_PROVIDER_ERROR"


class TypesafeInvalidOptionsError(TypesafeProviderError):
    code = "TYPESAFE_INVALID_OPTIONS"


class TypesafeDuplicateToolError(TypesafeProviderError):
    code = "TYPESAFE_DUPLICATE_TOOL"

    def __init__(self) -> None:
        super().__init__("Two tools in the same tool set share a slug.")


class TypesafeMissingApiKeyError(TypesafeProviderError):
    code = "TYPESAFE_MISSING_API_KEY"

    def __init__(self) -> None:
        super().__init__(
            "No TypeSafe API key was found. Set TYPESAFE_API_KEY, or pass `api_key` "
            "or `client` to TypesafeProvider."
        )


class TypesafeLimitError(TypesafeProviderError):
    code = "TYPESAFE_LIMIT"

    def __init__(self, limit: t.Literal["tools", "request_budget"]) -> None:
        super().__init__(
            "A tool set holds at most 254 tools."
            if limit == "tools"
            else "The state and questions exceed the TypeSafe request budget. "
            "State is never truncated."
        )
        self.limit = limit


TypesafeApiErrorReason: te.TypeAlias = t.Literal[
    "rate_limit",
    "authentication",
    "server_error",
    "request_rejected",
    "timeout",
    "connection",
    "unknown",
]

_API_ERROR_SUMMARIES: t.Dict[TypesafeApiErrorReason, str] = {
    "rate_limit": "The TypeSafe API rate limit was exceeded.",
    "authentication": "The TypeSafe API rejected the API key.",
    "server_error": "The TypeSafe API failed to handle the request.",
    "request_rejected": "The TypeSafe API rejected the request.",
    "timeout": "The TypeSafe API request timed out.",
    "connection": "The TypeSafe API could not be reached.",
    "unknown": "The TypeSafe API request failed.",
}


class TypesafeApiError(TypesafeProviderError):
    """Any failed TypeSafe request. ``reason`` tells the failures apart."""

    code = "TYPESAFE_API_ERROR"

    def __init__(
        self,
        reason: TypesafeApiErrorReason,
        *,
        status: t.Optional[int] = None,
        request_id: t.Optional[str] = None,
        retry_after_ms: t.Optional[float] = None,
    ) -> None:
        super().__init__(
            f"{_API_ERROR_SUMMARIES[reason]}{_describe_diagnostics(status, request_id)}"
        )
        self.reason = reason
        self.status = status
        self.request_id = request_id
        self.retry_after_ms = retry_after_ms
        """Set for ``rate_limit`` when the API sent a retry delay."""


TypesafeMalformedResponseIssue: te.TypeAlias = t.Literal[
    "invalid_envelope", "missing_answer", "invalid_answer", "choice_outside_options"
]


class TypesafeMalformedResponseError(TypesafeProviderError):
    code = "TYPESAFE_MALFORMED_RESPONSE"

    def __init__(
        self,
        issue: TypesafeMalformedResponseIssue,
        request_id: t.Optional[str] = None,
    ) -> None:
        super().__init__(
            f"The TypeSafe API returned a malformed response: {issue}"
            f"{_describe_diagnostics(None, request_id)}"
        )
        self.issue = issue
        self.request_id = request_id


class TypesafeMalformedDecisionError(TypesafeProviderError):
    code = "TYPESAFE_MALFORMED_DECISION"

    def __init__(self) -> None:
        super().__init__("The decision does not match the TypesafeDecision shape.")


class TypesafeAbstainedDecisionError(TypesafeProviderError):
    code = "TYPESAFE_ABSTAINED_DECISION"

    def __init__(self) -> None:
        super().__init__("An abstain decision cannot be executed.")


class TypesafeIncompleteDecisionError(TypesafeProviderError):
    code = "TYPESAFE_INCOMPLETE_DECISION"

    def __init__(self, missing: t.List[t.List[str]]) -> None:
        super().__init__(
            "The decision still has required arguments missing. "
            "Pass them as caller arguments."
        )
        self.missing = missing
        """Argument paths that still need a caller value. These are names, never values."""


class TypesafeConfirmationRequiredError(TypesafeProviderError):
    code = "TYPESAFE_CONFIRMATION_REQUIRED"

    def __init__(self) -> None:
        super().__init__(
            "This decision targets a destructive tool. Pass `confirm=True` to execute it."
        )


class TypesafeGateVetoError(TypesafeProviderError):
    code = "TYPESAFE_GATE_VETO"

    def __init__(self, probability: float, threshold: float) -> None:
        super().__init__(
            "The confidence gate vetoed this tool call: it does not match the user request."
        )
        self.probability = probability
        self.threshold = threshold


class TypesafeGateUnavailableError(TypesafeProviderError):
    code = "TYPESAFE_GATE_UNAVAILABLE"

    def __init__(self, reason: TypesafeAvailabilityReason) -> None:
        super().__init__(
            f"The confidence gate could not reach TypeSafe ({reason}) and blocked "
            "this tool call."
        )
        self.reason = reason


TypesafeGateBlockReason: te.TypeAlias = t.Literal[
    "unknown_tool", "oversized_call", "max_vetoes", "check_failed"
]


class TypesafeGateBlockedError(TypesafeProviderError):
    code = "TYPESAFE_GATE_BLOCKED"

    def __init__(self, reason: TypesafeGateBlockReason) -> None:
        super().__init__(f"The confidence gate blocked this tool call: {reason}.")
        self.reason = reason
