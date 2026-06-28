"""Tests for :func:`composio.utils.openapi.function_signature_from_jsonschema`.

This builder is what the ``google_adk`` provider uses to attach a
``__signature__`` to wrapped tools, so a crash here fails tool wrapping. The
top-level "no type" property already falls back to ``Any``; these tests cover
the nested combiner options (``oneOf``/``anyOf``/``allOf``) that used to raise.
"""

import typing as t

import pytest

from composio.utils.openapi import function_signature_from_jsonschema


def _annotation(prop: t.Dict[str, t.Any]) -> t.Any:
    params = function_signature_from_jsonschema({"properties": {"x": prop}})
    return params[0].annotation


class TestTypelessCombinerOptions:
    """A combiner option without a ``type`` key should default to Any, not raise."""

    @pytest.mark.unit
    @pytest.mark.schema
    def test_typeless_any_of_option_defaults_to_any(self):
        annotation = _annotation(
            {"anyOf": [{"description": "free form"}, {"type": "string"}]}
        )
        assert annotation == t.Union[t.Any, str]

    @pytest.mark.unit
    @pytest.mark.schema
    def test_typeless_one_of_option_defaults_to_any(self):
        annotation = _annotation(
            {"oneOf": [{"type": "string"}, {"description": "free form"}]}
        )
        assert annotation == t.Union[str, t.Any]

    @pytest.mark.unit
    @pytest.mark.schema
    def test_empty_all_of_resolves_to_any(self):
        assert _annotation({"allOf": []}) is t.Any


class TestEmptyCombinerLists:
    """An empty oneOf/anyOf has no options to union; fall back to Any."""

    @pytest.mark.unit
    @pytest.mark.schema
    def test_empty_any_of(self):
        assert _annotation({"anyOf": []}) is t.Any

    @pytest.mark.unit
    @pytest.mark.schema
    def test_empty_one_of(self):
        assert _annotation({"oneOf": []}) is t.Any


class TestExistingShapesUnchanged:
    """Shapes that already worked must keep resolving identically."""

    @pytest.mark.unit
    @pytest.mark.schema
    def test_nullable_any_of_is_optional(self):
        assert (
            _annotation({"anyOf": [{"type": "string"}, {"type": "null"}]})
            == t.Optional[str]
        )

    @pytest.mark.unit
    @pytest.mark.schema
    def test_multi_member_one_of(self):
        annotation = _annotation(
            {
                "oneOf": [
                    {"type": "string"},
                    {"type": "integer"},
                    {"type": "boolean"},
                    {"type": "number"},
                ]
            }
        )
        assert annotation == t.Union[str, int, bool, float]

    @pytest.mark.unit
    @pytest.mark.schema
    def test_enum(self):
        assert (
            _annotation({"type": "string", "enum": ["a", "b"]}) == t.Literal["a", "b"]
        )

    @pytest.mark.unit
    @pytest.mark.schema
    def test_array(self):
        assert (
            _annotation({"type": "array", "items": {"type": "string"}}) == t.List[str]
        )

    @pytest.mark.unit
    @pytest.mark.schema
    def test_object(self):
        assert _annotation({"type": "object"}) == t.Dict[str, t.Any]

    @pytest.mark.unit
    @pytest.mark.schema
    def test_typeless_property_is_any(self):
        assert _annotation({"description": "free form"}) is t.Any
