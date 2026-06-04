"""Tests for normalize_tool_arguments (issue #2406)."""

import pytest

from composio.exceptions import InvalidParams
from composio.utils.shared import normalize_tool_arguments

pytestmark = pytest.mark.core


class TestNormalizeToolArguments:
    def test_dict_is_returned_unchanged(self):
        payload = {"to": "a@b.com", "subject": "hi"}
        assert normalize_tool_arguments(payload) is payload

    def test_json_string_is_parsed(self):
        payload = {"to": "a@b.com", "subject": "hi", "body": "Hello"}
        assert (
            normalize_tool_arguments(
                '{"to": "a@b.com", "subject": "hi", "body": "Hello"}'
            )
            == payload
        )

    def test_none_becomes_empty_dict(self):
        assert normalize_tool_arguments(None) == {}

    @pytest.mark.parametrize("value", ["", "   ", "\n\t "])
    def test_empty_string_becomes_empty_dict(self, value):
        assert normalize_tool_arguments(value) == {}

    def test_malformed_json_string_raises(self):
        with pytest.raises(InvalidParams, match="not valid JSON"):
            normalize_tool_arguments('{"to": "a@b.com"')

    @pytest.mark.parametrize("value", ["[1, 2, 3]", "42", '"hello"'])
    def test_non_object_json_raises(self, value):
        with pytest.raises(InvalidParams, match="must resolve to an object"):
            normalize_tool_arguments(value)

    @pytest.mark.parametrize("value", [[1, 2, 3], 42, True])
    def test_non_dict_value_raises(self, value):
        with pytest.raises(InvalidParams, match="must resolve to an object"):
            normalize_tool_arguments(value)
