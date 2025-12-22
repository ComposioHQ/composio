"""
Unit tests for the LangchainProvider parameter name sanitization.

These tests verify the fix for PLEN-219:
`benzinga` with Langchain provider throws error — ValueError: 'parameters[date]' is not a valid parameter name
"""

import pytest

from composio_langchain.provider import (
    _is_valid_python_identifier,
    _sanitize_param_name,
    _substitute_reserved_python_keywords,
    _reinstate_reserved_python_keywords,
)


class TestIsValidPythonIdentifier:
    """Tests for _is_valid_python_identifier function."""

    def test_valid_simple_name(self):
        assert _is_valid_python_identifier("valid_name") is True

    def test_valid_private_name(self):
        assert _is_valid_python_identifier("_private") is True

    def test_valid_camel_case(self):
        assert _is_valid_python_identifier("CamelCase") is True

    def test_valid_with_numbers(self):
        assert _is_valid_python_identifier("name123") is True

    def test_invalid_brackets(self):
        """PLEN-219: Parameter names with brackets should be invalid."""
        assert _is_valid_python_identifier("parameters[date]") is False

    def test_invalid_starts_with_digit(self):
        assert _is_valid_python_identifier("123invalid") is False

    def test_invalid_dash(self):
        assert _is_valid_python_identifier("has-dash") is False

    def test_invalid_space(self):
        assert _is_valid_python_identifier("has space") is False

    def test_invalid_dot(self):
        assert _is_valid_python_identifier("has.dot") is False

    def test_empty_string(self):
        assert _is_valid_python_identifier("") is False


class TestSanitizeParamName:
    """Tests for _sanitize_param_name function."""

    def test_brackets_to_underscores(self):
        """PLEN-219: 'parameters[date]' should become 'parameters_date'."""
        assert _sanitize_param_name("parameters[date]") == "parameters_date"

    def test_dash_to_underscore(self):
        assert _sanitize_param_name("has-dash") == "has_dash"

    def test_space_to_underscore(self):
        assert _sanitize_param_name("has space") == "has_space"

    def test_starts_with_digit(self):
        assert _sanitize_param_name("123start") == "_123start"

    def test_multiple_underscores_collapsed(self):
        assert _sanitize_param_name("multiple___underscores") == "multiple_underscores"

    def test_trailing_underscores_removed(self):
        assert _sanitize_param_name("trailing_") == "trailing"

    def test_complex_brackets(self):
        """Test multiple bracket patterns."""
        assert _sanitize_param_name("params[0][name]") == "params_0_name"

    def test_empty_string(self):
        assert _sanitize_param_name("") == "_param"


class TestSubstituteReservedPythonKeywords:
    """Tests for _substitute_reserved_python_keywords function."""

    def test_reserved_keyword_for(self):
        schema = {"properties": {"for": {"type": "string"}}}
        modified, keywords = _substitute_reserved_python_keywords(schema)
        assert "for_rs" in modified["properties"]
        assert "for" not in modified["properties"]
        assert keywords["for_rs"] == "for"

    def test_reserved_keyword_async(self):
        schema = {"properties": {"async": {"type": "string"}}}
        modified, keywords = _substitute_reserved_python_keywords(schema)
        assert "async_rs" in modified["properties"]
        assert "async" not in modified["properties"]
        assert keywords["async_rs"] == "async"

    def test_invalid_identifier_brackets(self):
        """PLEN-219: Parameter names with brackets should be sanitized."""
        schema = {"properties": {"parameters[date]": {"type": "string"}}}
        modified, keywords = _substitute_reserved_python_keywords(schema)
        assert "parameters_date" in modified["properties"]
        assert "parameters[date]" not in modified["properties"]
        assert keywords["parameters_date"] == "parameters[date]"

    def test_valid_identifier_unchanged(self):
        schema = {"properties": {"valid_param": {"type": "string"}}}
        modified, keywords = _substitute_reserved_python_keywords(schema)
        assert "valid_param" in modified["properties"]
        assert keywords == {}

    def test_mixed_properties(self):
        """Test schema with both valid and invalid parameter names."""
        schema = {
            "properties": {
                "valid_param": {"type": "string"},
                "parameters[date]": {"type": "string"},
                "for": {"type": "string"},
            }
        }
        modified, keywords = _substitute_reserved_python_keywords(schema)
        assert "valid_param" in modified["properties"]
        assert "parameters_date" in modified["properties"]
        assert "for_rs" in modified["properties"]
        assert "parameters[date]" not in modified["properties"]
        assert "for" not in modified["properties"]

    def test_no_properties(self):
        schema = {"type": "object"}
        modified, keywords = _substitute_reserved_python_keywords(schema)
        assert keywords == {}

    def test_invalid_identifier_collision_is_not_silently_overwritten(self):
        schema = {
            "properties": {
                "parameters[date]": {"type": "string"},
                "parameters-date": {"type": "string"},
            }
        }
        modified, keywords = _substitute_reserved_python_keywords(schema)
        assert "parameters_date" in modified["properties"]
        assert "parameters_date_2" in modified["properties"]
        assert keywords["parameters_date"] != keywords["parameters_date_2"]

    def test_sanitized_name_collision_with_existing_valid_identifier(self):
        schema = {
            "properties": {
                "parameters_date": {"type": "integer"},
                "parameters[date]": {"type": "string"},
            }
        }
        modified, keywords = _substitute_reserved_python_keywords(schema)
        assert "parameters_date" in modified["properties"]
        assert "parameters_date_2" in modified["properties"]
        assert modified["properties"]["parameters_date"]["type"] == "integer"
        assert modified["properties"]["parameters_date_2"]["type"] == "string"
        assert keywords["parameters_date_2"] == "parameters[date]"

    def test_sanitized_name_becomes_reserved_keyword(self):
        """
        Regression test: When an invalid identifier is sanitized, the result
        can become a reserved keyword (e.g., 'for[]' -> 'for', 'async-' -> 'async').
        The sanitized result must be checked for reserved keywords and cleaned.
        """
        schema = {
            "properties": {
                "for[]": {"type": "string"},
                "async-": {"type": "string"},
            }
        }
        modified, keywords = _substitute_reserved_python_keywords(schema)
        # Both sanitized names should be cleaned to avoid reserved keywords
        assert "for_rs" in modified["properties"]
        assert "async_rs" in modified["properties"]
        assert "for" not in modified["properties"]
        assert "async" not in modified["properties"]
        assert keywords["for_rs"] == "for[]"
        assert keywords["async_rs"] == "async-"


class TestReinstateReservedPythonKeywords:
    """Tests for _reinstate_reserved_python_keywords function."""

    def test_reinstate_reserved_keyword(self):
        request = {"for_rs": "value"}
        keywords = {"for_rs": "for", "for_rs-_object_-": {}}
        result = _reinstate_reserved_python_keywords(request, keywords)
        assert "for" in result
        assert "for_rs" not in result
        assert result["for"] == "value"

    def test_reinstate_sanitized_param(self):
        """PLEN-219: Sanitized parameter names should be reinstated for API calls."""
        request = {"parameters_date": "2023-01-01"}
        keywords = {
            "parameters_date": "parameters[date]",
            "parameters_date-_object_-": {},
        }
        result = _reinstate_reserved_python_keywords(request, keywords)
        assert "parameters[date]" in result
        assert "parameters_date" not in result
        assert result["parameters[date]"] == "2023-01-01"

    def test_mixed_reinstatement(self):
        request = {
            "valid_param": "unchanged",
            "parameters_date": "2023-01-01",
            "for_rs": "loop_value",
        }
        keywords = {
            "parameters_date": "parameters[date]",
            "parameters_date-_object_-": {},
            "for_rs": "for",
            "for_rs-_object_-": {},
        }
        result = _reinstate_reserved_python_keywords(request, keywords)
        assert result["valid_param"] == "unchanged"
        assert result["parameters[date]"] == "2023-01-01"
        assert result["for"] == "loop_value"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
