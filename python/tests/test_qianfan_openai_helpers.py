import sys
from pathlib import Path

sys.path.insert(
    0, str(Path(__file__).resolve().parents[1] / "providers" / "openai")
)

from composio_openai import create_qianfan_client, create_qianfan_responses_client


def test_create_qianfan_client_uses_qianfan_base_url():
    client = create_qianfan_client(api_key="test-key")
    assert str(client.base_url) == "https://qianfan.baidubce.com/v2/"


def test_create_qianfan_client_adds_appid_header_when_present():
    client = create_qianfan_client(api_key="test-key", appid="app-123")
    assert client.default_headers["appid"] == "app-123"


def test_create_qianfan_client_merges_extra_headers():
    client = create_qianfan_client(
        api_key="test-key",
        appid="app-123",
        default_headers={"x-trace-id": "trace-1"},
    )
    assert client.default_headers["appid"] == "app-123"
    assert client.default_headers["x-trace-id"] == "trace-1"


def test_create_qianfan_responses_client_uses_same_defaults():
    client = create_qianfan_responses_client(api_key="test-key", appid="app-123")
    assert str(client.base_url) == "https://qianfan.baidubce.com/v2/"
    assert client.default_headers["appid"] == "app-123"
