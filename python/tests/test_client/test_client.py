"""
Test composio client class.
"""

import pytest

from composio.client import Composio
from composio.client.exceptions import ComposioClientError


def test_raise_invalid_api_key() -> None:
    """Test invalid API key."""
    with pytest.raises(ComposioClientError, match="API Key is not valid!"):
        Composio(api_key="API_KEY")
