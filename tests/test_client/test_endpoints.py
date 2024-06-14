"""
Test endpoints module.
"""

from composio.client.endpoints import Endpoint


def test_endpoint() -> None:
    """Test endpoint string serialisation."""
    endpoint = Endpoint("v1")

    assert str(endpoint) == "/v1"
    assert str(endpoint / "api") == "/v1/api"
    assert str(endpoint({"name": "john"})) == "/v1?name=john"
