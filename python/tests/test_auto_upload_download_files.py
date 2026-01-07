"""Tests for auto_upload_download_files feature in Composio SDK.

This module tests the auto_upload_download_files configuration option that controls
automatic file upload and download behavior during tool execution.
"""

from unittest.mock import Mock, patch

import pytest

from composio.client.types import Tool, tool_list_response
from composio.core.models.base import allow_tracking
from composio.core.models.tools import Tools


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
def mock_provider():
    """Create a mock provider."""
    provider = Mock()
    provider.name = "test_provider"
    return provider


def create_mock_tool(
    slug: str,
    toolkit_slug: str,
    input_parameters: dict = None,
    output_parameters: dict = None,
) -> Tool:
    """Create a mock tool for testing."""
    return Tool(
        name=f"Test {slug}",
        slug=slug,
        description="Test tool",
        input_parameters=input_parameters or {"type": "object", "properties": {}},
        output_parameters=output_parameters or {"type": "object", "properties": {}},
        available_versions=["v1.0.0"],
        version="v1.0.0",
        scopes=[],
        toolkit=tool_list_response.ItemToolkit(
            name=toolkit_slug.title(), slug=toolkit_slug, logo=""
        ),
        deprecated=tool_list_response.ItemDeprecated(
            available_versions=["v1.0.0"],
            displayName=f"Test {slug}",
            version="v1.0.0",
            toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
            is_deprecated=False,
        ),
        is_deprecated=False,
        no_auth=False,
        tags=[],
    )


class TestAutoUploadDownloadFilesEnabled:
    """Test cases when auto_upload_download_files is enabled."""

    def test_get_processes_schema_for_file_uploadable(self, mock_client, mock_provider):
        """Test that _get processes schema when auto_upload_download_files is True."""
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            auto_upload_download_files=True,
            toolkit_versions={"test_toolkit": "20251201_01"},
        )

        # Create tool with file_uploadable field
        mock_tool = create_mock_tool(
            slug="TEST_TOOL",
            toolkit_slug="test_toolkit",
            input_parameters={
                "type": "object",
                "properties": {
                    "file": {
                        "type": "string",
                        "file_uploadable": True,
                        "description": "Upload a file",
                    },
                    "text": {"type": "string"},
                },
            },
        )

        # Mock client.tools.list
        mock_client.tools.list.return_value = Mock(items=[mock_tool])

        # Mock provider.wrap_tools
        mock_provider.wrap_tools = Mock(return_value=[])

        # Get tools
        tools._get(user_id="test-user", tools=["TEST_TOOL"])

        # Verify schema was processed (format: "path" added to file_uploadable field)
        wrap_tools_call = mock_provider.wrap_tools.call_args
        processed_tools = wrap_tools_call[1]["tools"]
        file_param = processed_tools[0].input_parameters["properties"]["file"]

        # Check that file_uploadable schema was converted to path format
        assert file_param.get("format") == "path"
        assert file_param.get("type") == "string"

    def test_execute_calls_substitute_file_uploads(self, mock_client, mock_provider):
        """Test that execute calls substitute_file_uploads when enabled."""
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            auto_upload_download_files=True,
            toolkit_versions={"test_toolkit": "20251201_01"},
        )

        mock_tool = create_mock_tool(
            slug="TEST_TOOL",
            toolkit_slug="test_toolkit",
            input_parameters={
                "type": "object",
                "properties": {
                    "file": {"type": "string", "file_uploadable": True},
                },
            },
            output_parameters={
                "type": "object",
                "properties": {},
            },
        )

        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=mock_tool
        ):
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Patch both substitute methods to verify substitute_file_uploads is called
            with (
                patch.object(
                    tools._file_helper, "substitute_file_uploads"
                ) as mock_upload,
                patch.object(
                    tools._file_helper, "substitute_file_downloads"
                ) as mock_download,
            ):
                mock_upload.return_value = {"file": "processed_path"}
                mock_download.return_value = {
                    "data": {"result": "success"},
                    "error": None,
                    "successful": True,
                }

                tools.execute(
                    slug="TEST_TOOL",
                    arguments={"file": "/path/to/file.txt"},
                    dangerously_skip_version_check=True,
                )

                mock_upload.assert_called_once()

    def test_execute_calls_substitute_file_downloads(self, mock_client, mock_provider):
        """Test that execute calls substitute_file_downloads when enabled."""
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            auto_upload_download_files=True,
            toolkit_versions={"test_toolkit": "20251201_01"},
        )

        mock_tool = create_mock_tool(
            slug="TEST_TOOL",
            toolkit_slug="test_toolkit",
            input_parameters={
                "type": "object",
                "properties": {},
            },
            output_parameters={
                "type": "object",
                "properties": {
                    "file": {"type": "object", "file_downloadable": True},
                },
            },
        )

        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=mock_tool
        ):
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {
                    "file": {
                        "name": "result.txt",
                        "mimetype": "text/plain",
                        "s3url": "https://s3.example.com/result.txt",
                    }
                },
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Patch both substitute methods to verify substitute_file_downloads is called
            with (
                patch.object(
                    tools._file_helper, "substitute_file_uploads"
                ) as mock_upload,
                patch.object(
                    tools._file_helper, "substitute_file_downloads"
                ) as mock_download,
            ):
                mock_upload.return_value = {}
                mock_download.return_value = {
                    "data": {"file": "/downloaded/result.txt"},
                    "error": None,
                    "successful": True,
                }

                tools.execute(
                    slug="TEST_TOOL",
                    arguments={},
                    dangerously_skip_version_check=True,
                )

                mock_download.assert_called_once()


class TestAutoUploadDownloadFilesDisabled:
    """Test cases when auto_upload_download_files is disabled."""

    def test_get_does_not_process_schema_when_disabled(
        self, mock_client, mock_provider
    ):
        """Test that _get does not process schema when auto_upload_download_files is False."""
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            auto_upload_download_files=False,
            toolkit_versions={"test_toolkit": "20251201_01"},
        )

        # Create tool with file_uploadable field
        mock_tool = create_mock_tool(
            slug="TEST_TOOL",
            toolkit_slug="test_toolkit",
            input_parameters={
                "type": "object",
                "properties": {
                    "file": {
                        "type": "string",
                        "file_uploadable": True,
                        "description": "Upload a file",
                    },
                },
            },
        )

        # Mock client.tools.list
        mock_client.tools.list.return_value = Mock(items=[mock_tool])

        # Mock provider.wrap_tools
        mock_provider.wrap_tools = Mock(return_value=[])

        # Get tools
        tools._get(user_id="test-user", tools=["TEST_TOOL"])

        # Verify schema was NOT processed (file_uploadable field unchanged)
        wrap_tools_call = mock_provider.wrap_tools.call_args
        processed_tools = wrap_tools_call[1]["tools"]
        file_param = processed_tools[0].input_parameters["properties"]["file"]

        # Should NOT have format: "path" since auto_upload_download_files is False
        assert file_param.get("format") is None
        assert file_param.get("file_uploadable") is True

    def test_execute_skips_file_uploads_when_disabled(self, mock_client, mock_provider):
        """Test that execute does not call substitute_file_uploads when disabled."""
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            auto_upload_download_files=False,
            toolkit_versions={"test_toolkit": "20251201_01"},
        )

        mock_tool = create_mock_tool(
            slug="TEST_TOOL",
            toolkit_slug="test_toolkit",
            input_parameters={
                "type": "object",
                "properties": {
                    "file": {"type": "string", "file_uploadable": True},
                },
            },
        )

        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=mock_tool
        ):
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Patch substitute_file_uploads to verify it's NOT called
            with patch.object(
                tools._file_helper, "substitute_file_uploads"
            ) as mock_substitute:
                tools.execute(
                    slug="TEST_TOOL",
                    arguments={"file": "/path/to/file.txt"},
                    dangerously_skip_version_check=True,
                )

                mock_substitute.assert_not_called()

    def test_execute_skips_file_downloads_when_disabled(
        self, mock_client, mock_provider
    ):
        """Test that execute does not call substitute_file_downloads when disabled."""
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            auto_upload_download_files=False,
            toolkit_versions={"test_toolkit": "20251201_01"},
        )

        mock_tool = create_mock_tool(
            slug="TEST_TOOL",
            toolkit_slug="test_toolkit",
            output_parameters={
                "type": "object",
                "properties": {
                    "file": {"type": "object", "file_downloadable": True},
                },
            },
        )

        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=mock_tool
        ):
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {
                    "file": {
                        "name": "result.txt",
                        "mimetype": "text/plain",
                        "s3url": "https://s3.example.com/result.txt",
                    }
                },
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Patch substitute_file_downloads to verify it's NOT called
            with patch.object(
                tools._file_helper, "substitute_file_downloads"
            ) as mock_substitute:
                result = tools.execute(
                    slug="TEST_TOOL",
                    arguments={},
                    dangerously_skip_version_check=True,
                )

                mock_substitute.assert_not_called()

                # Verify raw S3 URL is preserved in response
                assert (
                    result["data"]["file"]["s3url"]
                    == "https://s3.example.com/result.txt"
                )


class TestAutoUploadDownloadFilesWithSDK:
    """Test cases for auto_upload_download_files with SDK initialization."""

    def test_sdk_passes_auto_upload_download_files_to_tools(self):
        """Test that Composio SDK passes auto_upload_download_files to Tools."""
        from composio.sdk import Composio

        with patch("composio.sdk.HttpClient"):
            # Test with default (True)
            with patch.object(Tools, "__init__", return_value=None) as mock_init:
                mock_provider = Mock()
                mock_provider.name = "test"

                Composio(
                    provider=mock_provider,
                    api_key="test-key",
                )

                # Should have passed auto_upload_download_files=True (default)
                mock_init.assert_called()
                call_kwargs = mock_init.call_args[1]
                assert call_kwargs.get("auto_upload_download_files", True) is True

    def test_sdk_passes_false_to_tools(self):
        """Test that Composio SDK correctly passes auto_upload_download_files=False."""
        from composio.sdk import Composio

        with patch("composio.sdk.HttpClient"):
            with patch.object(Tools, "__init__", return_value=None) as mock_init:
                mock_provider = Mock()
                mock_provider.name = "test"

                Composio(
                    provider=mock_provider,
                    api_key="test-key",
                    auto_upload_download_files=False,
                )

                mock_init.assert_called()
                call_kwargs = mock_init.call_args[1]
                assert call_kwargs.get("auto_upload_download_files") is False
