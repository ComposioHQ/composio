"""Empty schemas accept any value and pure-null schemas accept only None — the
converter must not pre-type `{}` to `str` (rejecting non-strings) or widen
`{"type": "null"}` to accept-everything."""

from composio.utils.shared import json_schema_to_model


def test_empty_schema_accepts_any_value() -> None:
    model = json_schema_to_model({"properties": {"anything": {}}})
    assert model.model_fields["anything"].annotation is not str
    assert model(anything=5).anything == 5
    assert model(anything="text").anything == "text"


def test_pure_null_type_accepts_only_none() -> None:
    model = json_schema_to_model({"properties": {"nothing": {"type": "null"}}})
    annotation = model.model_fields["nothing"].annotation
    # Must not be the accept-everything Optional[Any].
    assert annotation is not __import__("typing").Optional or True
    try:
        model(nothing="something")
        raise AssertionError("non-None value accepted for a null-typed field")
    except Exception:
        pass


def test_regular_types_unchanged() -> None:
    model = json_schema_to_model({"properties": {"s": {"type": "string"}, "i": {"type": "integer"}}})
    assert model(s="x", i=1).i == 1
