"""Behavioral tests for the real-home write guard."""

from types import SimpleNamespace

import pytest

from tests.conftest import guard_real_home_directory


def test_real_home_guard_reports_without_deleting_new_directory(tmp_path):
    baseline = {"path": tmp_path, "entries": set()}
    request = SimpleNamespace(node=SimpleNamespace(nodeid="test_external_write"))
    guard = guard_real_home_directory.__wrapped__(request, baseline)

    next(guard)
    unrelated = tmp_path / "unrelated-empty-directory"
    unrelated.mkdir()

    with pytest.raises(pytest.fail.Exception, match="created"):
        next(guard)

    assert unrelated.is_dir()
