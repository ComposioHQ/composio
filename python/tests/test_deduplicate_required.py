"""Tests for deduplicate_required_fields utility."""

import copy

import pytest

from composio.utils.shared import deduplicate_required_fields


class TestDeduplicateRequiredFields:
    def test_removes_duplicates_from_top_level_required(self):
        schema = {
            "type": "object",
            "properties": {
                "owner": {"type": "string"},
                "repo": {"type": "string"},
            },
            "required": ["owner", "repo", "owner"],
        }
        result = deduplicate_required_fields(schema)
        assert result["required"] == ["owner", "repo"]

    def test_leaves_unique_required_unchanged(self):
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "number"},
            },
            "required": ["name", "age"],
        }
        result = deduplicate_required_fields(schema)
        assert result["required"] == ["name", "age"]

    def test_handles_schema_without_required(self):
        schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
        }
        result = deduplicate_required_fields(schema)
        assert "required" not in result

    def test_deduplicates_nested_properties(self):
        schema = {
            "type": "object",
            "properties": {
                "address": {
                    "type": "object",
                    "properties": {
                        "street": {"type": "string"},
                        "city": {"type": "string"},
                    },
                    "required": ["street", "city", "street"],
                },
            },
            "required": ["address"],
        }
        result = deduplicate_required_fields(schema)
        assert result["required"] == ["address"]
        assert result["properties"]["address"]["required"] == ["street", "city"]

    def test_deduplicates_inside_combiners(self):
        schema = {
            "type": "object",
            "allOf": [
                {
                    "type": "object",
                    "required": ["foo", "bar", "foo"],
                }
            ],
            "anyOf": [
                {
                    "type": "object",
                    "required": ["x", "y", "x"],
                }
            ],
        }
        result = deduplicate_required_fields(schema)
        assert result["allOf"][0]["required"] == ["foo", "bar"]
        assert result["anyOf"][0]["required"] == ["x", "y"]

    def test_handles_array_items(self):
        schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                },
                "required": ["id", "name", "id"],
            },
        }
        result = deduplicate_required_fields(schema)
        assert result["items"]["required"] == ["id", "name"]

    def test_does_not_mutate_original(self):
        original = {
            "type": "object",
            "required": ["a", "b", "a"],
        }
        original_copy = copy.deepcopy(original)
        deduplicate_required_fields(original)
        assert original == original_copy

    def test_handles_non_dict_input(self):
        assert deduplicate_required_fields("not a dict") == "not a dict"
        assert deduplicate_required_fields(42) == 42
        assert deduplicate_required_fields(None) is None

    def test_preserves_order(self):
        schema = {
            "type": "object",
            "required": ["c", "a", "b", "a", "c"],
        }
        result = deduplicate_required_fields(schema)
        assert result["required"] == ["c", "a", "b"]
