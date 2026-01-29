"""pytest configuration module"""

import base64
import hashlib
import hmac
import json
from pathlib import Path
from unittest.mock import Mock

import pytest

from composio.core.models.triggers import Triggers


def get_py_fixtures_dir() -> Path:
    """Get the Python fixtures directory path."""
    return Path(__file__).parent / "fixtures" / "webhook"


def get_ts_fixtures_dir() -> Path:
    """Get the TypeScript fixtures directory path."""
    return (
        Path(__file__).parent.parent.parent
        / "ts"
        / "packages"
        / "core"
        / "test"
        / "fixtures"
        / "webhook"
    )


def compute_signature(
    webhook_id: str, timestamp: str, payload: str, secret: str
) -> str:
    """Compute webhook signature using HMAC-SHA256."""
    to_sign = f"{webhook_id}.{timestamp}.{payload}"
    signature = hmac.new(
        key=secret.encode("utf-8"),
        msg=to_sign.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    return f"v1,{base64.b64encode(signature).decode('utf-8')}"


def load_fixtures() -> list[dict]:
    """Load all webhook fixtures from the fixtures directory."""
    fixtures_dir = get_py_fixtures_dir()
    fixtures = []
    for fixture_file in fixtures_dir.glob("v*.json"):
        if "golden" in fixture_file.name:
            continue
        with open(fixture_file) as f:
            fixtures.append(json.load(f))
    return fixtures


def load_golden_signatures() -> dict:
    """Load golden signatures for contract testing."""
    fixtures_dir = get_py_fixtures_dir()
    with open(fixtures_dir / "golden-signatures.json") as f:
        return json.load(f)


@pytest.fixture
def mock_client() -> Mock:
    """Create a mock HTTP client."""
    client = Mock()
    client.triggers_types = Mock()
    client.trigger_instances = Mock()
    client.trigger_instances.manage = Mock()
    client.connected_accounts = Mock()
    return client


@pytest.fixture
def triggers(mock_client: Mock) -> Triggers:
    """Create a Triggers instance."""
    return Triggers(client=mock_client)


@pytest.fixture
def webhook_fixtures() -> list[dict]:
    """Load all webhook fixtures."""
    return load_fixtures()


@pytest.fixture
def golden_signatures() -> dict:
    """Load golden signatures."""
    return load_golden_signatures()
