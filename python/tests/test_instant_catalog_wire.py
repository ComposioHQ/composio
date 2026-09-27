"""Catalog Instant fields survive the generated client and SDK boundaries."""

import httpx

from composio import Composio


TOOL = {
    "slug": "EXA_SEARCH",
    "name": "Search",
    "description": "Search the web",
    "available_versions": ["20260927_00"],
    "deprecated": {
        "available_versions": ["20260927_00"],
        "displayName": "Search",
        "is_deprecated": False,
        "toolkit": {"logo": "https://example.com/exa.svg"},
        "version": "20260927_00",
    },
    "input_parameters": {},
    "output_parameters": {},
    "is_deprecated": False,
    "no_auth": False,
    "scopes": [],
    "tags": [],
    "toolkit": {"slug": "exa", "name": "Exa", "logo": "https://example.com/exa.svg"},
    "version": "20260927_00",
    "instant": {
        "supported": True,
        "price": {"description": "$0.01 per search", "discount": 10},
    },
}

TOOLKIT_META = {
    "categories": [],
    "created_at": "2026-09-27T00:00:00Z",
    "updated_at": "2026-09-27T00:00:00Z",
    "description": "Search",
    "logo": "https://example.com/exa.svg",
    "tools_count": 1,
    "triggers_count": 0,
    "version": "20260927_00",
}

TOOLKIT = {
    "slug": "exa",
    "name": "Exa",
    "type": "native",
    "is_local_toolkit": False,
    "deprecated": {"toolkitId": "exa"},
    "meta": TOOLKIT_META,
    "instant": {"supported": True},
}


def test_catalog_instant_types_over_http():
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/api/v3.1/tools":
            return httpx.Response(
                200,
                json={
                    "items": [TOOL],
                    "total_pages": 1,
                    "total_items": 1,
                    "current_page": 1,
                },
            )
        if path == "/api/v3.1/tools/EXA_SEARCH":
            return httpx.Response(200, json=TOOL)
        if path == "/api/v3.1/toolkits":
            return httpx.Response(
                200,
                json={
                    "items": [TOOLKIT],
                    "total_pages": 1,
                    "total_items": 1,
                    "current_page": 1,
                },
            )
        if path == "/api/v3.1/toolkits/exa":
            return httpx.Response(
                200,
                json={
                    **TOOLKIT,
                    "deprecated": {
                        "toolkit_id": "exa",
                        "raw_proxy_info_by_auth_schemes": [],
                    },
                    "meta": {**TOOLKIT_META, "available_versions": ["20260927_00"]},
                    "composio_managed_auth": [],
                    "enabled": True,
                },
            )
        if path == "/api/v3.1/toolkits/multi":
            return httpx.Response(
                200,
                json={
                    "items": [TOOLKIT],
                    "total_pages": 1,
                    "total_items": 1,
                    "current_page": 1,
                },
            )
        raise AssertionError(f"Unexpected catalog request: {request.method} {path}")

    composio = Composio(
        api_key="test",
        base_url="https://api.example",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    tool = composio.tools.get_raw_composio_tool_by_slug("EXA_SEARCH")
    assert tool.instant is not None
    assert tool.instant.supported is True
    assert tool.instant.price is not None
    assert tool.instant.price.description == "$0.01 per search"
    assert tool.instant.price.discount == 10
    assert (
        composio.tools.get_raw_composio_tools(tools=["EXA_SEARCH"])[0].instant
        == tool.instant
    )

    listed = composio.toolkits.list().items[0]
    assert listed.instant is not None and listed.instant.supported is True
    assert composio.toolkits.get("exa").instant == listed.instant
    assert composio.toolkits.get_many(["exa"])[0].instant == listed.instant
