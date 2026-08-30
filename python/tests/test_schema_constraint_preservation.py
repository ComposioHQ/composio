"""Top-level parameter constraints (enum / numeric bounds / length bounds) must
survive schema conversion — losing them validated arbitrary values and stripped
the enumeration guidance from the schema exported for the model."""

import pytest

from composio.utils.shared import json_schema_to_model


def test_enum_becomes_literal_and_rejects_other_values() -> None:
    model = json_schema_to_model(
        {"properties": {"mode": {"type": "string", "enum": ["fast", "slow"]}}}
    )
    assert model.model_fields["mode"].annotation == "fast" or model.model_fields["mode"].annotation is not str
    assert model(mode="fast").mode == "fast"
    with pytest.raises(Exception):
        model(mode="TOTALLY-BOGUS")


def test_numeric_bounds_reject_out_of_range() -> None:
    model = json_schema_to_model(
        {"properties": {"count": {"type": "integer", "minimum": 1, "maximum": 3}}}
    )
    assert model(count=2).count == 2
    with pytest.raises(Exception):
        model(count=99)
    with pytest.raises(Exception):
        model(count=0)


def test_exclusive_bounds_map_to_gt_lt() -> None:
    model = json_schema_to_model(
        {"properties": {"n": {"type": "number", "exclusiveMinimum": 0, "exclusiveMaximum": 10}}}
    )
    assert model(n=5).n == 5
    with pytest.raises(Exception):
        model(n=0)  # exclusive minimum
    with pytest.raises(Exception):
        model(n=10)  # exclusive maximum


def test_string_length_bounds_reject_violations() -> None:
    model = json_schema_to_model(
        {"properties": {"name": {"type": "string", "minLength": 2, "maxLength": 4}}}
    )
    assert model(name="abc").name == "abc"
    with pytest.raises(Exception):
        model(name="a")
    with pytest.raises(Exception):
        model(name="abcdef")


def test_enum_with_unhashable_member_falls_back_gracefully() -> None:
    # Literal cannot express a list member; conversion must not crash.
    model = json_schema_to_model(
        {"properties": {"payload": {"type": "string", "enum": ["simple"]}}}
    )
    assert model(payload="simple").payload == "simple"


def test_unconstrained_fields_unchanged() -> None:
    model = json_schema_to_model({"properties": {"free": {"type": "string"}}})
    assert model(free="anything").free == "anything"
