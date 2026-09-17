"""Public types and errors of the TypeSafe (Jev) provider."""

from __future__ import annotations

import typing as t

import typing_extensions as te
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr
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


TypesafeLogLevel: te.TypeAlias = t.Literal["debug", "info", "warn", "error", "off"]

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


TypesafeToolThresholds: te.TypeAlias = t.Mapping[str, TypesafeThresholds]


class TypesafeDescribeArgumentContext(te.TypedDict):
    tool: Tool
    argument: str
    property: t.Dict[str, t.Any]


class TypesafeDescribeOverrides(te.TypedDict, total=False):
    tool: t.Callable[[Tool], t.Optional[str]]
    """Replace the routing text of a tool. Return ``None`` to keep the generated text."""
    argument: t.Callable[[TypesafeDescribeArgumentContext], t.Optional[str]]
    """Replace the description used in an argument's questions."""


TypesafeContextScope: te.TypeAlias = t.Literal["arguments", "all"]


class TypesafeRequestState(te.TypedDict):
    request: str
    context: te.NotRequired[TypesafeJsonValue]


TypesafeState: te.TypeAlias = t.Union[str, TypesafeRequestState]
"""A plain request, or a request with supporting context."""

# ---------------------------------------------------------------------------
# Decisions
# ---------------------------------------------------------------------------


class TypesafeJudgement(te.TypedDict):
    kind: t.Literal["routing", "gate", "argument"]
    path: te.NotRequired[t.List[str]]
    score: float
    required: bool


class TypesafeDecisionMeta(te.TypedDict):
    model: t.Optional[str]
    request_ids: t.List[str]
    strategy: t.Literal["none", "fan_out", "route_then_arguments"]
    request_count: int
    tool_version: te.NotRequired[str]


class _BoundDecision(te.TypedDict):
    """What a `call` and a `partial` share: the tool and the arguments Jev bound."""

    tool: str
    arguments: t.Dict[str, t.Any]
    dropped: t.List[t.List[str]]
    """Optional arguments dropped because their answer was below the argument threshold."""
    confidence: float
    judgements: t.List[TypesafeJudgement]
    risk: TypesafeRisk
    requires_confirmation: bool
    meta: TypesafeDecisionMeta


class TypesafeCallDecision(_BoundDecision):
    kind: t.Literal["call"]


class TypesafePartialDecision(_BoundDecision):
    kind: t.Literal["partial"]
    missing: t.List[t.List[str]]
    suggestions: t.Dict[str, t.Any]
    """Low-confidence guesses for required arguments, keyed by argument name."""


class TypesafeCandidate(te.TypedDict):
    tool: str
    probability: float


TypesafeAbstainReason: te.TypeAlias = t.Literal[
    "no_tools", "empty_state", "none_fit", "no_action_requested", "low_confidence"
]


class TypesafeAbstainDecision(te.TypedDict):
    kind: t.Literal["abstain"]
    reason: TypesafeAbstainReason
    candidates: t.List[TypesafeCandidate]
    confidence: float
    meta: TypesafeDecisionMeta


TypesafeDecision: te.TypeAlias = t.Union[
    TypesafeCallDecision, TypesafePartialDecision, TypesafeAbstainDecision
]

Probability = te.Annotated[float, Field(ge=0, le=1, strict=True, allow_inf_nan=False)]
_Path = te.Annotated[t.List[StrictStr], Field(min_length=1)]


class _JudgementModel(BaseModel):
    kind: t.Literal["routing", "gate", "argument"]
    path: t.Optional[_Path] = None
    score: Probability
    required: StrictBool


class _MetaModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model: t.Optional[StrictStr]
    request_ids: t.List[StrictStr]
    strategy: t.Literal["none", "fan_out", "route_then_arguments"]
    request_count: te.Annotated[StrictInt, Field(ge=0)]
    tool_version: t.Optional[StrictStr] = None


class _BoundModel(BaseModel):
    tool: te.Annotated[StrictStr, Field(min_length=1)]
    arguments: t.Dict[StrictStr, t.Any]
    dropped: t.List[_Path]
    confidence: Probability
    judgements: t.List[_JudgementModel]
    risk: t.Literal["read_only", "mutating", "destructive"]
    requires_confirmation: StrictBool
    meta: _MetaModel


class _CallModel(_BoundModel):
    kind: t.Literal["call"]


class _PartialModel(_BoundModel):
    kind: t.Literal["partial"]
    missing: t.List[_Path]
    suggestions: t.Dict[StrictStr, t.Any]


class _CandidateModel(BaseModel):
    tool: StrictStr
    probability: Probability


class _AbstainModel(BaseModel):
    kind: t.Literal["abstain"]
    reason: t.Literal[
        "no_tools", "empty_state", "none_fit", "no_action_requested", "low_confidence"
    ]
    candidates: t.List[_CandidateModel]
    confidence: Probability
    meta: _MetaModel


class _DecisionEnvelope(BaseModel):
    decision: t.Union[_CallModel, _PartialModel, _AbstainModel] = Field(
        discriminator="kind"
    )


def parse_decision(value: t.Any) -> TypesafeDecision:
    """
    Parses a decision that was stored or sent over the wire.

    :raises TypesafeMalformedDecisionError: when the value is not a decision.
    """
    parsed: t.Optional[_DecisionEnvelope] = None
    try:
        parsed = _DecisionEnvelope.model_validate({"decision": value})
    except PydanticValidationError:
        # The validation error quotes its input, so it is never chained or kept.
        pass
    if parsed is None:
        raise TypesafeMalformedDecisionError()
    return t.cast(TypesafeDecision, _dump_decision(parsed.decision))


def _dump_decision(
    decision: t.Union[_CallModel, _PartialModel, _AbstainModel],
) -> t.Dict[str, t.Any]:
    dumped = decision.model_dump()
    # `tool_version` and a judgement's `path` are absent rather than null.
    if dumped["meta"]["tool_version"] is None:
        del dumped["meta"]["tool_version"]
    for judgement in dumped.get("judgements", []):
        if judgement["path"] is None:
            del judgement["path"]
    return dumped


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


class TypesafeApiError(TypesafeProviderError):
    code = "TYPESAFE_API_ERROR"
    summary: t.ClassVar[str] = "The TypeSafe API request failed."

    def __init__(
        self,
        *,
        sdk_error: t.Optional[str] = None,
        status: t.Optional[int] = None,
        request_id: t.Optional[str] = None,
    ) -> None:
        super().__init__(f"{self.summary}{_describe_diagnostics(status, request_id)}")
        self.sdk_error = sdk_error
        """Class name of the ``typesafe-sdk`` exception, when it is a known one."""
        self.status = status
        self.request_id = request_id


class TypesafeRateLimitError(TypesafeApiError):
    code = "TYPESAFE_RATE_LIMIT"
    summary = "The TypeSafe API rate limit was exceeded."

    def __init__(
        self,
        *,
        sdk_error: t.Optional[str] = None,
        status: t.Optional[int] = None,
        request_id: t.Optional[str] = None,
        retry_after_ms: t.Optional[float] = None,
    ) -> None:
        super().__init__(sdk_error=sdk_error, status=status, request_id=request_id)
        self.retry_after_ms = retry_after_ms


class TypesafeAuthenticationError(TypesafeApiError):
    code = "TYPESAFE_AUTHENTICATION"
    summary = "The TypeSafe API rejected the API key."


class TypesafeServerError(TypesafeApiError):
    code = "TYPESAFE_SERVER_ERROR"
    summary = "The TypeSafe API failed to handle the request."


class TypesafeRequestRejectedError(TypesafeApiError):
    code = "TYPESAFE_REQUEST_REJECTED"
    summary = "The TypeSafe API rejected the request."


class TypesafeTimeoutError(TypesafeApiError):
    code = "TYPESAFE_TIMEOUT"
    summary = "The TypeSafe API request timed out."


class TypesafeConnectionError(TypesafeApiError):
    code = "TYPESAFE_CONNECTION"
    summary = "The TypeSafe API could not be reached."


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
