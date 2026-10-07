"""Product provenance must reach the HTTP transport alongside legacy headers."""

import platform
from importlib.metadata import version

import httpx
import pytest

from composio.client import HttpClient


@pytest.mark.parametrize("clone", [False, True])
def test_product_provenance_on_request(clone):
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"items": []})

    with HttpClient(
        provider="test-provider",
        api_key="test-key",
        base_url="https://backend.invalid",
        http_client=httpx.Client(transport=httpx.MockTransport(respond)),
    ) as client:
        request_client = client.without_retries if clone else client
        request_client.tools.list(limit=1)

    headers = requests[0].headers
    assert headers["x-client-provenance"] == "composio"
    assert headers["x-client-version"] == headers["x-sdk-version"]
    assert headers["x-client-language"] == "python"
    assert headers["x-client-library"] == "composio-client"
    assert headers["x-client-library-version"] == version("composio-client")
    assert headers["x-client-runtime"] == "python"
    assert headers["x-runtime-version"] == platform.python_version()
    assert headers["x-source"] == "PYTHON_SDK"
    assert headers["x-framework"] == "test-provider"
    assert headers["x-runtime"] == HttpClient._runtime_env


def test_product_provenance_is_not_added_to_another_origin():
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={})

    with HttpClient(
        provider="test-provider",
        api_key="test-key",
        base_url="https://backend.invalid",
        http_client=httpx.Client(transport=httpx.MockTransport(respond)),
    ) as client:
        client.get("https://storage.invalid/file", cast_to=dict)

    assert "x-client-provenance" not in requests[0].headers
    assert "x-framework" not in requests[0].headers
