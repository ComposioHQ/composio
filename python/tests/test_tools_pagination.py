"""Test pagination in tools.get_raw_composio_tools.

Verifies that the SDK auto-paginates when no explicit limit is provided,
and respects the user's limit with a single request when one is given.
"""

from unittest.mock import Mock

import pytest

from composio.client.types import Tool, tool_list_response
from composio.core.models.base import allow_tracking
from composio.core.models.tools import Tools
from composio.core.provider._openai import OpenAIProvider


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


def _make_tool(slug: str, toolkit_slug: str = "github") -> Tool:
    """Create a minimal mock Tool."""
    return Tool(
        name=slug,
        slug=slug,
        description="test",
        input_parameters={"type": "object", "properties": {}},
        output_parameters={},
        available_versions=["v1"],
        version="v1",
        scopes=[],
        toolkit=tool_list_response.ItemToolkit(
            name=toolkit_slug, slug=toolkit_slug, logo=""
        ),
        deprecated=tool_list_response.ItemDeprecated(
            available_versions=["v1"],
            displayName=slug,
            version="v1",
            toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
            is_deprecated=False,
        ),
        is_deprecated=False,
        no_auth=False,
        tags=[],
    )


def _make_list_response(items, next_cursor=None):
    """Create a mock ToolListResponse."""
    resp = Mock()
    resp.items = items
    resp.next_cursor = next_cursor
    resp.total_items = len(items)
    resp.current_page = 1
    resp.total_pages = 1
    return resp


def _make_tools_instance(mock_client):
    provider = OpenAIProvider()
    return Tools(client=mock_client, provider=provider)


class TestToolsPagination:
    """Test auto-pagination when no explicit limit is provided."""

    def test_single_page_no_cursor(self):
        """When all results fit in one page, only one request is made."""
        mock_client = Mock()
        page_items = [_make_tool(f"TOOL_{i}") for i in range(50)]
        mock_client.tools.list.return_value = _make_list_response(
            page_items, next_cursor=None
        )

        tools = _make_tools_instance(mock_client)
        result = tools.get_raw_composio_tools(toolkits=["github"])

        assert len(result) == 50
        assert mock_client.tools.list.call_count == 1

    def test_multiple_pages(self):
        """When results span multiple pages, auto-paginate until next_cursor is null."""
        mock_client = Mock()
        page1 = [_make_tool(f"TOOL_{i}") for i in range(1000)]
        page2 = [_make_tool(f"TOOL_{i}") for i in range(1000, 1416)]

        mock_client.tools.list.side_effect = [
            _make_list_response(page1, next_cursor="cursor_page2"),
            _make_list_response(page2, next_cursor=None),
        ]

        tools = _make_tools_instance(mock_client)
        result = tools.get_raw_composio_tools(toolkits=["github", "gmail", "slack"])

        assert len(result) == 1416
        assert mock_client.tools.list.call_count == 2

        # Verify first call has no cursor, second call has cursor
        calls = mock_client.tools.list.call_args_list
        from composio_client import omit

        assert calls[0].kwargs.get("cursor") == omit
        assert calls[1].kwargs.get("cursor") == "cursor_page2"

    def test_three_pages(self):
        """Verify pagination works with more than two pages."""
        mock_client = Mock()
        page1 = [_make_tool(f"T_{i}") for i in range(1000)]
        page2 = [_make_tool(f"T_{i}") for i in range(1000, 2000)]
        page3 = [_make_tool(f"T_{i}") for i in range(2000, 2500)]

        mock_client.tools.list.side_effect = [
            _make_list_response(page1, next_cursor="c1"),
            _make_list_response(page2, next_cursor="c2"),
            _make_list_response(page3, next_cursor=None),
        ]

        tools = _make_tools_instance(mock_client)
        result = tools.get_raw_composio_tools(toolkits=["github"])

        assert len(result) == 2500
        assert mock_client.tools.list.call_count == 3

    def test_explicit_limit_single_request(self):
        """When user provides an explicit limit, make a single request."""
        mock_client = Mock()
        page_items = [_make_tool(f"TOOL_{i}") for i in range(10)]
        mock_client.tools.list.return_value = _make_list_response(
            page_items, next_cursor="some_cursor"
        )

        tools = _make_tools_instance(mock_client)
        result = tools.get_raw_composio_tools(toolkits=["github"], limit=10)

        assert len(result) == 10
        # Only one request even though next_cursor was returned
        assert mock_client.tools.list.call_count == 1

    def test_explicit_limit_passes_through(self):
        """Verify explicit limit is passed to the API, not overridden."""
        mock_client = Mock()
        mock_client.tools.list.return_value = _make_list_response([])

        tools = _make_tools_instance(mock_client)
        tools.get_raw_composio_tools(toolkits=["github"], limit=50)

        assert mock_client.tools.list.call_args.kwargs["limit"] == 50

    def test_auto_paginate_uses_max_page_size(self):
        """Without explicit limit, requests use _MAX_PAGE_SIZE (1000)."""
        mock_client = Mock()
        mock_client.tools.list.return_value = _make_list_response(
            [_make_tool("T")], next_cursor=None
        )

        tools = _make_tools_instance(mock_client)
        tools.get_raw_composio_tools(toolkits=["github"])

        assert mock_client.tools.list.call_args.kwargs["limit"] == 1000

    def test_search_also_paginates(self):
        """Pagination also works when using search parameter."""
        mock_client = Mock()
        page1 = [_make_tool(f"T_{i}") for i in range(1000)]
        page2 = [_make_tool(f"T_{i}") for i in range(1000, 1200)]

        mock_client.tools.list.side_effect = [
            _make_list_response(page1, next_cursor="c1"),
            _make_list_response(page2, next_cursor=None),
        ]

        tools = _make_tools_instance(mock_client)
        result = tools.get_raw_composio_tools(search="email")

        assert len(result) == 1200
        assert mock_client.tools.list.call_count == 2

    def test_tool_slugs_no_pagination(self):
        """When fetching by tool slugs, no pagination is applied (single request)."""
        mock_client = Mock()
        mock_client.tools.list.return_value = _make_list_response(
            [_make_tool("GITHUB_STAR_REPO")], next_cursor=None
        )

        tools = _make_tools_instance(mock_client)
        result = tools.get_raw_composio_tools(tools=["GITHUB_STAR_REPO"])

        assert len(result) == 1
        assert mock_client.tools.list.call_count == 1

    def test_empty_cursor_string_stops_pagination(self):
        """An empty string cursor should also stop pagination."""
        mock_client = Mock()
        mock_client.tools.list.return_value = _make_list_response(
            [_make_tool("T")], next_cursor=""
        )

        tools = _make_tools_instance(mock_client)
        result = tools.get_raw_composio_tools(toolkits=["github"])

        assert len(result) == 1
        assert mock_client.tools.list.call_count == 1
