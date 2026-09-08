"""pytest configuration module"""

import base64
import hashlib
import hmac
import json
import os
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


def get_py_json_schema_corpus_dir() -> Path:
    """Get the Python JSON Schema conversion corpus directory path."""
    return Path(__file__).parent / "fixtures" / "json-schema-conversion"


def get_ts_json_schema_corpus_dir() -> Path:
    """Get the TypeScript JSON Schema conversion corpus directory path."""
    return (
        Path(__file__).parent.parent.parent
        / "ts"
        / "packages"
        / "core"
        / "test"
        / "fixtures"
        / "json-schema-conversion"
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


def mock_http_client() -> Mock:
    """Build a mock ``HttpClient`` for tool-execution tests.

    Production routes non-idempotent writes through ``client.without_retries``
    (a retry-disabled clone of the client). The mock mirrors that by returning
    itself for ``without_retries``, so assertions on ``client.tools.execute`` and
    ``client.tools.proxy`` still observe the call.
    """
    client = Mock()
    client.without_retries = client
    return client


@pytest.fixture
def mock_client() -> Mock:
    """Create a mock HTTP client."""
    client = mock_http_client()
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


@pytest.fixture(scope="session")
def _real_home_baseline():
    """The real home directory and its top-level entries, captured once.

    Session-scoped so it is read before any test can monkeypatch ``$HOME``.
    Resolving it per-test would let a test that repoints ``$HOME`` also move
    the guard's own reference point, which is exactly the class of mistake the
    guard exists to catch.
    """
    real_home = Path(os.path.expanduser("~"))
    try:
        return {"path": real_home, "entries": set(os.listdir(real_home))}
    except OSError:
        return {"path": real_home, "entries": None}


@pytest.fixture(autouse=True)
def guard_real_home_directory(request, _real_home_baseline):
    """Fail any test that creates entries directly in the real home directory.

    A test that meant to sandbox `~` but patched the wrong thing
    (`Path.home` does not affect `Path.expanduser`, which reads `$HOME`)
    silently writes into the developer's actual home instead. That has already
    destroyed real user data once. This turns the silent case into a failure.

    Only top-level entries are compared, so a test writing under an existing
    `~/.composio` is unaffected; creating `~/downloads` is not.
    """
    if _real_home_baseline["entries"] is None:
        yield
        return

    yield

    real_home = _real_home_baseline["path"]
    try:
        after = set(os.listdir(real_home))
    except OSError:
        return

    created = after - _real_home_baseline["entries"]
    # Roll the baseline forward before failing, so one offending test does not
    # then fail every test that follows it.
    _real_home_baseline["entries"] = after
    if not created:
        return

    pytest.fail(
        f"{request.node.nodeid} created {sorted(created)} in the real home "
        f"directory ({real_home}). Sandbox `$HOME` with "
        f"`monkeypatch.setenv('HOME', str(tmp_path))` — patching `Path.home` "
        f"does not affect `Path.expanduser`."
    )
