"""Instant support and optional published pricing on raw tool metadata."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from composio_client import omit
from composio_client.types import tool_list_response, tool_retrieve_response

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
                instant=tool_list_response.CurrentItemInstant.model_validate(
                    {
                        "supported": True,
                        "price": {
                            "description": "$7 per 1,000 searches",
                            "discount": None,
                        },
                    }
                ),
            )
        ]
    )

    if use_toolkits:
        [tool] = tools.get_raw_composio_tools(toolkits=["exa"], include_pricing=True)
    else:
        [tool] = tools.get_raw_composio_tools(
            tools=["EXA_SEARCH"], include_pricing=True
        )

    assert client.tools.list.call_args.kwargs["include_pricing"] is True
    assert isinstance(tool, tool_list_response.Item)
    assert isinstance(tool.instant, tool_list_response.CurrentItemInstant)
    assert tool.instant.price is not None
    assert tool.instant.price.description == "$7 per 1,000 searches"
    assert tool.instant.price.discount is None


@pytest.mark.parametrize("use_toolkits", [False, True])
def test_list_exposes_instant_support_without_requesting_pricing(
    use_toolkits: bool,
) -> None:
    tools, client = _tools()
    client.tools.list.return_value = SimpleNamespace(
        items=[
            tool_list_response.Item.model_construct(
                slug="EXA_SEARCH",
                instant=tool_list_response.CurrentItemInstant(supported=True),
            )
        ]
    )

    if use_toolkits:
        [tool] = tools.get_raw_composio_tools(toolkits=["exa"])
    else:
        [tool] = tools.get_raw_composio_tools(tools=["EXA_SEARCH"])

    assert client.tools.list.call_args.kwargs["include_pricing"] is omit
    assert tool.instant is not None
    assert tool.instant.supported is True
    assert tool.instant.price is None


def test_detail_requests_and_exposes_instant_pricing() -> None:
    tools, client = _tools()
    client.tools.retrieve.return_value = tool_retrieve_response.ToolRetrieveResponse.model_construct(
        slug="EXA_SEARCH",
        instant=tool_retrieve_response.CurrentToolRetrieveResponseInstant.model_validate(
            {
                "supported": True,
                "price": {"description": "$7 per 1,000 searches"},
            }
        ),
    )

    tool = tools.get_raw_composio_tool_by_slug("EXA_SEARCH", include_pricing=True)

    assert client.tools.retrieve.call_args.kwargs["include_pricing"] is True
    assert tool.instant is not None
    assert tool.instant.supported is True
    assert tool.instant.price is not None
    assert tool.instant.price.description == "$7 per 1,000 searches"


def test_detail_exposes_instant_support_without_requesting_pricing() -> None:
    tools, client = _tools()
    client.tools.retrieve.return_value = (
        tool_retrieve_response.ToolRetrieveResponse.model_construct(
            slug="EXA_SEARCH",
            instant=tool_retrieve_response.CurrentToolRetrieveResponseInstant(
                supported=True
            ),
        )
    )

    tool = tools.get_raw_composio_tool_by_slug("EXA_SEARCH")

    assert client.tools.retrieve.call_args.kwargs["include_pricing"] is omit
    assert tool.instant is not None
    assert tool.instant.supported is True
    assert tool.instant.price is None
