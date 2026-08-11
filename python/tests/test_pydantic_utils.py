"""Tests for the pydantic utility module."""

import pydantic
import pytest
from composio_client import omit

from composio.utils.pydantic import none_to_omit, parse_pydantic_error


class _Model(pydantic.BaseModel):
    name: str
    age: int


def test_none_to_omit_converts_none():
    assert none_to_omit(None) is omit


def test_none_to_omit_passes_values_through():
    assert none_to_omit("hello") == "hello"
    assert none_to_omit(42) == 42
    # Falsy-but-not-None values are preserved (not converted to omit).
    assert none_to_omit(0) == 0
    assert none_to_omit("") == ""


def _validation_error(**kwargs) -> pydantic.ValidationError:
    with pytest.raises(pydantic.ValidationError) as exc_info:
        _Model(**kwargs)
    return exc_info.value


def test_parse_pydantic_error_lists_missing_fields():
    message = parse_pydantic_error(_validation_error(age=5))
    assert "Invalid request data provided" in message
    assert "missing" in message
    assert "name" in message


def test_parse_pydantic_error_reports_type_errors_with_param():
    message = parse_pydantic_error(_validation_error(name="a", age="not-an-int"))
    # A non-missing error names the offending parameter.
    assert "age" in message
    assert "missing" not in message


def test_parse_pydantic_error_handles_missing_and_other_together():
    message = parse_pydantic_error(_validation_error(age="not-an-int"))
    assert "name" in message  # missing
    assert "age" in message  # type error
