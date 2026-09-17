"""Validates TypeSafe responses and maps SDK exceptions to provider errors."""

from __future__ import annotations

import dataclasses
import math
import typing as t

from pydantic import BaseModel, StrictStr
from pydantic import ValidationError as PydanticValidationError

from .types import (
    Probability,
    TypesafeApiError,
    TypesafeApiErrorReason,
    TypesafeMalformedResponseError,
    TypesafeProviderError,
    TypesafeQuestion,
)


class _Envelope(BaseModel):
    model: StrictStr
    answers: t.Dict[StrictStr, t.Any]


class NoulAnswer(BaseModel):
    type: t.Literal["noul"]
    noul: Probability


class ChoiceAnswer(BaseModel):
    type: t.Literal["choice"]
    choice: StrictStr
    confidence: Probability
    probabilities: t.Dict[StrictStr, Probability]


_Model = t.TypeVar("_Model", bound=BaseModel)


def _parse(model: t.Type[_Model], value: t.Any) -> t.Optional[_Model]:
    # A pydantic error quotes its input, so it is swallowed here and never chained.
    try:
        return model.model_validate(value)
    except PydanticValidationError:
        return None


@dataclasses.dataclass(frozen=True)
class ValidatedAnswers:
    model: str
    nouls: t.Dict[str, NoulAnswer]
    choices: t.Dict[str, ChoiceAnswer]
    request_id: t.Optional[str] = None


def _to_plain(response: t.Any) -> t.Any:
    """`typesafe-sdk` returns msgspec structs. A mapping from an injected client passes through."""
    if isinstance(response, t.Mapping):
        return response
    import msgspec

    try:
        return msgspec.to_builtins(response)
    except (TypeError, ValueError, msgspec.MsgspecError):
        return None


def read_request_id(response: t.Any) -> t.Optional[str]:
    """The `x-typesafe-request-id` of an SDK response. The SDK raises when the header is absent."""
    if isinstance(response, t.Mapping):
        return None
    try:
        request_id = getattr(response, "request_id", None)
    except Exception:
        return None
    return request_id if isinstance(request_id, str) else None


def validate_answers(
    response: t.Any,
    questions: t.Mapping[str, TypesafeQuestion],
    request_id: t.Optional[str],
) -> ValidatedAnswers:
    """
    Checks a response against the questions that were asked. `typesafe-sdk` validates the
    answer shapes with msgspec; it cannot know which IDs, types, and option keys were expected.
    """
    envelope = _parse(_Envelope, _to_plain(response))
    if envelope is None:
        raise TypesafeMalformedResponseError("invalid_envelope", request_id)

    nouls: t.Dict[str, NoulAnswer] = {}
    choices: t.Dict[str, ChoiceAnswer] = {}
    for question_id, question in questions.items():
        if question_id not in envelope.answers:
            raise TypesafeMalformedResponseError("missing_answer", request_id)
        if question["type"] == "noul":
            noul = _parse(NoulAnswer, envelope.answers[question_id])
            if noul is None:
                raise TypesafeMalformedResponseError("invalid_answer", request_id)
            nouls[question_id] = noul
            continue
        choice = _parse(ChoiceAnswer, envelope.answers[question_id])
        if choice is None:
            raise TypesafeMalformedResponseError("invalid_answer", request_id)
        option_keys = question["criteria"].keys()
        if any(
            key not in option_keys for key in (choice.choice, *choice.probabilities)
        ):
            raise TypesafeMalformedResponseError("choice_outside_options", request_id)
        choices[question_id] = choice
    return ValidatedAnswers(
        model=envelope.model, nouls=nouls, choices=choices, request_id=request_id
    )


def _read(error: BaseException, name: str) -> t.Any:
    # `request_id` is a property on the SDK's exceptions, so reading it can raise.
    try:
        return getattr(error, name, None)
    except Exception:
        return None


def to_provider_error(error: BaseException) -> TypesafeProviderError:
    """
    Maps anything raised by the client to a provider error that holds safe diagnostics only.

    Only the class names, `status`, `request_id`, and `retry_after_ms` are read. The
    exception itself, its message, body, headers, and traceback are never retained, so the
    caller must raise the result outside the `except` block to keep `__context__` empty.
    """
    if isinstance(error, TypesafeProviderError):
        return error
    names = {cls.__name__ for cls in type(error).__mro__}
    status = _read(error, "status")
    status = (
        status if isinstance(status, int) and not isinstance(status, bool) else None
    )
    request_id = _read(error, "request_id")
    request_id = request_id if isinstance(request_id, str) else None
    retry_after = _read(error, "retry_after_ms")
    retry_after_ms = (
        float(retry_after)
        if isinstance(retry_after, (int, float))
        and not isinstance(retry_after, bool)
        and math.isfinite(retry_after)
        else None
    )

    if "TypeSafeAPIResponseValidationError" in names:
        return TypesafeMalformedResponseError("invalid_envelope", request_id)
    reason: TypesafeApiErrorReason = "unknown"
    if "TypeSafeAPITimeoutError" in names or isinstance(error, TimeoutError):
        reason = "timeout"
    elif "TypeSafeAPIConnectionError" in names or isinstance(error, ConnectionError):
        reason = "connection"
    elif "TypeSafeRateLimitError" in names or status == 429:
        reason = "rate_limit"
    elif status in (401, 403):
        reason = "authentication"
    elif status is not None and status >= 500:
        reason = "server_error"
    elif status is not None and status >= 400:
        reason = "request_rejected"
    return TypesafeApiError(
        reason, status=status, request_id=request_id, retry_after_ms=retry_after_ms
    )


def is_size_rejection(error: TypesafeProviderError) -> bool:
    """A rejection that a smaller request might avoid."""
    return (
        isinstance(error, TypesafeApiError)
        and error.reason == "request_rejected"
        and error.status in (400, 413, 422)
    )
