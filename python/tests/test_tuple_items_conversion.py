"""Draft-04 tuple-form ``items`` (a list of positional subschemas) must convert to
a usable list type — the historical behavior degraded the whole array field to
bare ``str``, rejecting every legitimate list input."""

from composio.utils.shared import json_schema_to_model


def test_tuple_items_with_boolean_member_converts_to_list() -> None:
    model = json_schema_to_model(
        {"properties": {"pair": {"type": "array", "items": [{"type": "string"}, False]}}}
    )
    annotation = model.model_fields["pair"].annotation
    assert annotation is not str
    assert model(pair=["a", "b"]).pair == ["a", "b"]


def test_mixed_tuple_items_become_union_list() -> None:
    model = json_schema_to_model(
        {"properties": {"mix": {"type": "array", "items": [{"type": "string"}, {"type": "integer"}]}}}
    )
    assert model(mix=["x", 3]).mix == ["x", 3]


def test_all_members_unsatable_degrades_to_list_any() -> None:
    model = json_schema_to_model(
        {"properties": {"odd": {"type": "array", "items": [False, False]}}}
    )
    annotation = model.model_fields["odd"].annotation
    assert annotation is not str


def test_single_schema_items_still_work() -> None:
    model = json_schema_to_model(
        {"properties": {"tags": {"type": "array", "items": {"type": "string"}}}}
    )
    assert model(tags=["a"]).tags == ["a"]
