"""Instant support and optional published pricing on raw tool metadata."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from composio_client.types import tool_list_response, tool_retrieve_response

from composio.client.types import Tool, ToolInstant
from composio.core.models.tools import Tools
from tests.conftest import mock_http_client


def _tools() -> tuple[Tools, Mock]:
    client = mock_http_client()
    return Tools(client=client, provider=Mock()), client


@pytest.mark.parametrize("use_toolkits", [False, True])
def test_list_requests_and_exposes_instant_pricing(use_toolkits: bool) -> None:
    tools, client = _tools()
    client.tools.list.return_value = SimpleNamespace(
        items=[
            tool_list_response.Item.model_construct(
                slug="EXA_SEARCH",
                instant={
                    "supported": True,
                    "price": {"description": "$7 per 1,000 searches", "discount": None},
                },
            )
        ]
    )

    if use_toolkits:
        [tool] = tools.get_raw_composio_tools(toolkits=["exa"], include_pricing=True)
    else:
        [tool] = tools.get_raw_composio_tools(
            tools=["EXA_SEARCH"], include_pricing=True
        )

    assert client.tools.list.call_args.kwargs["extra_query"] == {
        "include_pricing": True
    }
    assert isinstance(tool, Tool)
    assert isinstance(tool.instant, ToolInstant)
    assert tool.instant.price is not None
    assert tool.instant.price.description == "$7 per 1,000 searches"
    assert tool.instant.price.discount is None


def test_detail_requests_and_exposes_instant_without_price() -> None:
    tools, client = _tools()
    client.tools.retrieve.return_value = (
        tool_retrieve_response.ToolRetrieveResponse.model_construct(
            slug="EXA_SEARCH", instant={"supported": True}
        )
    )

    tool = tools.get_raw_composio_tool_by_slug("EXA_SEARCH", include_pricing=True)

    assert client.tools.retrieve.call_args.kwargs["extra_query"] == {
        "include_pricing": True
    }
    assert tool.instant == ToolInstant(supported=True)
    assert tool.instant.price is None
