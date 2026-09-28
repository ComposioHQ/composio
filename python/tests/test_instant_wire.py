"""Exercise the SDK against the generated client and new Instant wire."""

import json

import httpx

from composio import Composio


def test_instant_session_create_retrieve_patch_and_execute_over_http():
    requests: list[tuple[str, str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else {}
        requests.append((request.method, request.url.path, body))
        config = {
            "user_id": "user_123",
            "execute": {},
            "search": {},
            "preload": {"tools": []},
            "instant": {"toolkits": {"enable": ["exa"]}, "return_charge": True},
            "connected_account_usage": False,
        }
        if request.url.path.endswith("/execute"):
            return httpx.Response(
                200,
                json={
                    "data": {"results": []},
                    "error": None,
                    "log_id": "log_123",
                    "instant": {
                        "charge": {
                            "amount": "0",
                            "currency": "USD",
                            "charged_by": "composio",
                        }
                    },
                },
            )
        if request.url.path.endswith("/search"):
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "error": None,
                    "results": [],
                    "tool_schemas": {
                        "EXA_SEARCH": {
                            "tool_slug": "EXA_SEARCH",
                            "toolkit": "exa",
                            "instant": {"supported": True, "available": True},
                        }
                    },
                    "toolkit_connection_statuses": [
                        {
                            "toolkit": "exa",
                            "description": "Search",
                            "has_active_connection": False,
                            "is_ready": True,
                            "instant": {
                                "supported": True,
                                "available": True,
                                "allowed_tool_slugs": ["EXA_SEARCH"],
                            },
                            "status_message": "Ready",
                        }
                    ],
                    "next_steps_guidance": [],
                    "session": {"id": "s1", "generate_id": False, "instructions": ""},
                    "time_info": {
                        "current_time_utc": "2026-09-27T00:00:00Z",
                        "current_time_utc_epoch_seconds": 0,
                        "message": "UTC",
                    },
                },
            )
        return httpx.Response(
            200,
            json={
                "session_id": "s1",
                "config_version": 1,
                "config": config,
                "mcp": {"type": "http", "url": "https://api.example/mcp"},
                "tool_router_tools": [],
            },
        )

    client = Composio(
        api_key="test",
        base_url="https://api.example",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    session = client.sessions.create(
        user_id="user_123",
        toolkits=["exa"],
        instant={"toolkits": {"enable": ["exa"]}, "return_charge": True},
        connected_account_usage=False,
    )
    assert session.config.instant == {
        "toolkits": {"enable": ["exa"]},
        "return_charge": True,
    }
    assert session.config.connected_account_usage is False
    assert "premium_usage" not in session.config.model_dump()
    assert requests[0][2]["instant"] == {
        "toolkits": {"enable": ["exa"]},
        "return_charge": True,
    }
    assert requests[0][2]["connected_account_usage"] is False
    assert "premium_usage" not in requests[0][2]

    retrieved = client.sessions.use("s1")
    assert retrieved.config.instant == session.config.instant

    found = session.search(query="search the web")
    assert found.tool_schemas["EXA_SEARCH"].instant is not None
    assert found.tool_schemas["EXA_SEARCH"].instant.available is True
    assert found.toolkit_connection_statuses[0].instant is not None
    assert found.toolkit_connection_statuses[0].instant.allowed_tool_slugs == [
        "EXA_SEARCH"
    ]

    session.update(instant={"return_charge": True}, connected_account_usage=False)
    assert session.config.connected_account_usage is False
    assert requests[-1][2] == {
        "instant": {"return_charge": True},
        "connected_account_usage": False,
    }

    result = session.execute("EXA_SEARCH", arguments={"query": "example"})
    assert result.instant == {
        "charge": {"amount": "0", "currency": "USD", "charged_by": "composio"}
    }
