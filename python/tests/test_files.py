"""Tests for file helper functionality in composio/core/models/_files.py.

These tests ensure that the FileHelper class correctly handles JSON schemas
that use anyOf, oneOf, allOf, or $ref instead of direct 'type' properties.
"""

from unittest.mock import Mock

import pytest

from composio.client.types import Tool, tool_list_response
from composio.core.models._files import FileHelper
from composio.core.models.base import allow_tracking


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


@pytest.fixture
def mock_client():
    """Create a mock HTTP client."""
    return Mock()


@pytest.fixture
def file_helper(mock_client):
    """Create a FileHelper instance with a mock client."""
    return FileHelper(client=mock_client)


@pytest.fixture
def mock_tool():
    """Create a mock tool for testing."""
    return Tool(
        name="Test Tool",
        slug="TEST_TOOL",
        description="Test tool",
        input_parameters={
            "properties": {
                "query": {"type": "string"},
            },
            "type": "object",
        },
        output_parameters={
            "properties": {
                "data": {"type": "object", "properties": {}},
            },
            "type": "object",
        },
        available_versions=["v1.0.0"],
        version="v1.0.0",
        scopes=[],
        toolkit=tool_list_response.ItemToolkit(
            name="Test Toolkit", slug="test_toolkit", logo=""
        ),
        deprecated=tool_list_response.ItemDeprecated(
            available_versions=["v1.0.0"],
            displayName="Test Tool",
            version="v1.0.0",
            toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
            is_deprecated=False,
        ),
        is_deprecated=False,
        no_auth=False,
        tags=[],
    )


class TestFileHelperSchemaHandling:
    """Test cases for handling schemas without direct 'type' property.

    Regression tests for PLEN-766: KeyError: 'type' when schemas use
    anyOf, oneOf, allOf, or $ref instead of direct type properties.
    """

    def test_substitute_file_uploads_with_oneof_schema(self, file_helper, mock_tool):
        """Test that oneOf schemas don't cause KeyError in upload path."""
        schema_with_oneof = {
            "properties": {
                "input": {
                    "oneOf": [
                        {"type": "string"},
                        {"type": "object", "properties": {"file": {"type": "string"}}},
                    ]
                }
            }
        }
        request = {"input": {"file": "test.txt"}}

        # Should not raise KeyError
        result = file_helper._substitute_file_uploads_recursively(
            tool=mock_tool,
            schema=schema_with_oneof,
            request=request.copy(),
        )
        assert result == {"input": {"file": "test.txt"}}

    def test_substitute_file_uploads_with_anyof_schema(self, file_helper, mock_tool):
        """Test that anyOf schemas don't cause KeyError in upload path."""
        schema_with_anyof = {
            "properties": {
                "data": {
                    "anyOf": [
                        {"type": "string"},
                        {"type": "object", "properties": {"value": {"type": "string"}}},
                    ]
                }
            }
        }
        request = {"data": {"value": "test"}}

        # Should not raise KeyError
        result = file_helper._substitute_file_uploads_recursively(
            tool=mock_tool,
            schema=schema_with_anyof,
            request=request.copy(),
        )
        assert result == {"data": {"value": "test"}}

    def test_substitute_file_uploads_with_allof_schema(self, file_helper, mock_tool):
        """Test that allOf schemas don't cause KeyError in upload path."""
        schema_with_allof = {
            "properties": {
                "config": {
                    "allOf": [
                        {"properties": {"name": {"type": "string"}}},
                        {"properties": {"value": {"type": "string"}}},
                    ]
                }
            }
        }
        request = {"config": {"name": "test", "value": "123"}}

        # Should not raise KeyError
        result = file_helper._substitute_file_uploads_recursively(
            tool=mock_tool,
            schema=schema_with_allof,
            request=request.copy(),
        )
        assert result == {"config": {"name": "test", "value": "123"}}

    def test_substitute_file_uploads_with_ref_schema(self, file_helper, mock_tool):
        """Test that $ref schemas don't cause KeyError in upload path."""
        schema_with_ref = {
            "properties": {"reference": {"$ref": "#/definitions/SomeType"}}
        }
        request = {"reference": {"nested": "value"}}

        # Should not raise KeyError
        result = file_helper._substitute_file_uploads_recursively(
            tool=mock_tool,
            schema=schema_with_ref,
            request=request.copy(),
        )
        assert result == {"reference": {"nested": "value"}}

    def test_substitute_file_downloads_with_oneof_schema(self, file_helper, mock_tool):
        """Test that oneOf schemas don't cause KeyError in download path."""
        schema_with_oneof = {
            "properties": {
                "result": {
                    "oneOf": [
                        {"type": "string"},
                        {"type": "object", "properties": {"data": {"type": "string"}}},
                    ]
                }
            }
        }
        response = {"result": {"data": "some value"}}

        # Should not raise KeyError
        result = file_helper._substitute_file_downloads_recursively(
            tool=mock_tool,
            schema=schema_with_oneof,
            request=response.copy(),
        )
        assert result == {"result": {"data": "some value"}}

    def test_substitute_file_downloads_with_anyof_schema(self, file_helper, mock_tool):
        """Test that anyOf schemas don't cause KeyError in download path."""
        schema_with_anyof = {
            "properties": {
                "output": {
                    "anyOf": [
                        {"type": "string"},
                        {
                            "type": "object",
                            "properties": {"nested": {"type": "string"}},
                        },
                    ]
                }
            }
        }
        response = {"output": {"nested": "value"}}

        # Should not raise KeyError
        result = file_helper._substitute_file_downloads_recursively(
            tool=mock_tool,
            schema=schema_with_anyof,
            request=response.copy(),
        )
        assert result == {"output": {"nested": "value"}}

    def test_substitute_file_downloads_with_allof_schema(self, file_helper, mock_tool):
        """Test that allOf schemas don't cause KeyError in download path."""
        schema_with_allof = {
            "properties": {
                "response": {
                    "allOf": [
                        {"properties": {"status": {"type": "string"}}},
                        {"properties": {"message": {"type": "string"}}},
                    ]
                }
            }
        }
        response = {"response": {"status": "ok", "message": "success"}}

        # Should not raise KeyError
        result = file_helper._substitute_file_downloads_recursively(
            tool=mock_tool,
            schema=schema_with_allof,
            request=response.copy(),
        )
        assert result == {"response": {"status": "ok", "message": "success"}}

    def test_substitute_file_downloads_with_ref_schema(self, file_helper, mock_tool):
        """Test that $ref schemas don't cause KeyError in download path."""
        schema_with_ref = {
            "properties": {"data": {"$ref": "#/definitions/ResponseType"}}
        }
        response = {"data": {"field": "value"}}

        # Should not raise KeyError
        result = file_helper._substitute_file_downloads_recursively(
            tool=mock_tool,
            schema=schema_with_ref,
            request=response.copy(),
        )
        assert result == {"data": {"field": "value"}}

    def test_substitute_file_uploads_with_normal_type_still_works(
        self, file_helper, mock_tool
    ):
        """Test that normal schemas with 'type' property still work correctly."""
        schema_with_type = {
            "properties": {
                "nested": {
                    "type": "object",
                    "properties": {
                        "value": {"type": "string"},
                    },
                }
            }
        }
        request = {"nested": {"value": "test"}}

        # Should process normally and recurse into nested object
        result = file_helper._substitute_file_uploads_recursively(
            tool=mock_tool,
            schema=schema_with_type,
            request=request.copy(),
        )
        assert result == {"nested": {"value": "test"}}

    def test_substitute_file_downloads_with_normal_type_still_works(
        self, file_helper, mock_tool
    ):
        """Test that normal schemas with 'type' property still work correctly."""
        schema_with_type = {
            "properties": {
                "data": {
                    "type": "object",
                    "properties": {
                        "result": {"type": "string"},
                    },
                }
            }
        }
        response = {"data": {"result": "success"}}

        # Should process normally and recurse into nested object
        result = file_helper._substitute_file_downloads_recursively(
            tool=mock_tool,
            schema=schema_with_type,
            request=response.copy(),
        )
        assert result == {"data": {"result": "success"}}

    def test_substitute_with_empty_properties(self, file_helper, mock_tool):
        """Test handling of schemas with empty properties."""
        schema_empty = {"properties": {}}
        request = {"unknown": {"nested": "value"}}

        # Should not raise any errors
        result = file_helper._substitute_file_uploads_recursively(
            tool=mock_tool,
            schema=schema_empty,
            request=request.copy(),
        )
        assert result == {"unknown": {"nested": "value"}}

    def test_substitute_with_no_properties_key(self, file_helper, mock_tool):
        """Test handling of schemas without properties key."""
        schema_no_props = {"type": "object"}
        request = {"data": {"value": "test"}}

        # Should return request unchanged
        result = file_helper._substitute_file_uploads_recursively(
            tool=mock_tool,
            schema=schema_no_props,
            request=request.copy(),
        )
        assert result == {"data": {"value": "test"}}
