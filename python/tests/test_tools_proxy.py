"""Request body sent by ``Tools.proxy``."""

import json
import typing as t
from unittest.mock import Mock

import httpx
import pytest

from composio.client import HttpClient
from composio.core.models.base import allow_tracking
from composio.core.models.tools import Tools


@pytest.fixture(autouse=True)
def disable_telemetry():
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


def _proxy_body(**kwargs: t.Any) -> t.Dict[str, t.Any]:
    requests: t.List[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"status": 200, "data": {}})

    client = HttpClient(
        provider="test",
        api_key="sk-test",
        base_url="https://backend.invalid",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    Tools(client=client, provider=Mock()).proxy(
        endpoint="/any", method="GET", connected_account_id="ca_123", **kwargs
    )
    assert len(requests) == 1
    return json.loads(requests[0].content)


def test_proxy_forwards_user_id() -> None:
    body = _proxy_body(user_id="user-123")

    assert body["connected_account_id"] == "ca_123"
    assert body["user_id"] == "user-123"


def test_proxy_omits_user_id_when_not_passed() -> None:
    assert "user_id" not in _proxy_body()
