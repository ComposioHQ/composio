"""Cross-SDK compatibility tests.

These tests verify that the Python SDK uses identical fixtures
to the TypeScript SDK, ensuring webhook verification works consistently
across both SDKs.
"""

import json

import pytest

from tests.conftest import get_py_fixtures_dir, get_ts_fixtures_dir


class TestCrossSDKFixtureCompatibility:
    """Tests verifying Python and TypeScript fixtures are synchronized."""

    @pytest.mark.parametrize(
        "fixture_name",
        [
            "golden-signatures.json",
            "v1-github-push.json",
            "v2-github-push.json",
            "v3-github-push.json",
        ],
    )
    def test_fixtures_are_identical(self, fixture_name: str) -> None:
        """Verify TypeScript and Python fixtures are byte-identical."""
        ts_path = get_ts_fixtures_dir() / fixture_name
        py_path = get_py_fixtures_dir() / fixture_name

        with open(ts_path) as f:
            ts_content = json.load(f)
        with open(py_path) as f:
            py_content = json.load(f)

        assert ts_content == py_content, (
            f"Fixture {fixture_name} differs between TypeScript and Python SDKs. "
            "Ensure fixtures are kept in sync."
        )
