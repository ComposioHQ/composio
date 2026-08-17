"""Regression tests for lazy creation of the Composio cache directory.

``composio/core/models/_files.py`` used to create ``~/.composio`` and assert
that it was writable at *module import time*. Because ``composio/__init__.py``
imports ``tools.py``, which imports ``_files.py`` unconditionally, a bare
``import composio`` raised ``RuntimeError`` on any read-only filesystem --
AWS Lambda, distroless containers, ``ProtectHome=true`` systemd units -- even
for programs that never touched a file.

These tests pin the fix: importing the package performs no filesystem work,
``COMPOSIO_CACHE_DIR`` is honoured when set after import, and the writability
check still raises the same error when the directory is genuinely needed.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

from composio.core.models import _files


@pytest.fixture()
def unusable_cache_dir(tmp_path: Path) -> Path:
    """A cache path that cannot be created, without relying on permissions.

    ``chmod`` based read-only directories are a no-op when the test suite runs
    as root (``os.access(..., W_OK)`` returns True for uid 0), which is common
    in containerised CI. Nesting the cache directory *underneath a regular
    file* makes ``mkdir`` fail with ``NotADirectoryError`` for every user.
    """
    blocker = tmp_path / "blocker"
    blocker.write_text("not a directory")
    return blocker / "cache"


def test_importing_composio_does_not_create_the_cache_directory(
    tmp_path: Path, unusable_cache_dir: Path
) -> None:
    """The regression test: ``import composio`` must not touch the filesystem.

    Run in a subprocess so the import genuinely happens under the patched
    environment rather than hitting the already-imported module in this
    process.
    """
    env = dict(os.environ)
    env["COMPOSIO_CACHE_DIR"] = str(unusable_cache_dir)
    env["COMPOSIO_API_KEY"] = "test-key"

    result = subprocess.run(
        [sys.executable, "-c", "import composio"],
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )

    assert result.returncode == 0, (
        "importing composio with an uncreatable cache directory must succeed, "
        f"but it failed with:\n{result.stderr}"
    )
    assert not unusable_cache_dir.exists()


def test_cache_directory_is_created_only_on_demand(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    cache_dir = tmp_path / "not-yet-there"
    monkeypatch.setenv("COMPOSIO_CACHE_DIR", str(cache_dir))

    # Merely resolving the path must not create it.
    assert _files.get_cache_directory() == cache_dir
    assert not cache_dir.exists()

    assert _files.ensure_cache_directory() == cache_dir
    assert cache_dir.is_dir()


def test_cache_dir_env_var_is_read_after_import(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """``COMPOSIO_CACHE_DIR`` used to be frozen at import time."""
    first = tmp_path / "first"
    second = tmp_path / "second"

    monkeypatch.setenv("COMPOSIO_CACHE_DIR", str(first))
    assert _files.get_cache_directory() == first

    monkeypatch.setenv("COMPOSIO_CACHE_DIR", str(second))
    assert _files.get_cache_directory() == second


def test_home_is_not_resolved_when_the_env_var_is_set(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The escape hatch has to work when ``Path.home()`` itself fails.

    The old code passed ``Path.home() / ...`` as the *default argument* to
    ``os.environ.get``, which Python evaluates eagerly, so setting
    ``COMPOSIO_CACHE_DIR`` did not save a user whose home directory could not
    be resolved.
    """

    def _explode() -> Path:
        raise RuntimeError("Could not determine home directory")

    monkeypatch.setattr(Path, "home", staticmethod(_explode))
    monkeypatch.setenv("COMPOSIO_CACHE_DIR", str(tmp_path / "cache"))

    assert _files.get_cache_directory() == tmp_path / "cache"


def test_unresolvable_home_raises_a_helpful_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _explode() -> Path:
        raise RuntimeError("Could not determine home directory")

    monkeypatch.setattr(Path, "home", staticmethod(_explode))
    monkeypatch.delenv("COMPOSIO_CACHE_DIR", raising=False)

    with pytest.raises(RuntimeError, match="COMPOSIO_CACHE_DIR"):
        _files.get_cache_directory()


def test_output_file_directory_hangs_off_the_cache_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("COMPOSIO_CACHE_DIR", str(tmp_path / "cache"))
    assert _files.get_output_file_directory() == tmp_path / "cache" / "files"


def test_ensure_cache_directory_still_reports_unwritable_paths(
    monkeypatch: pytest.MonkeyPatch, unusable_cache_dir: Path
) -> None:
    """The writability check is deferred, not removed."""
    monkeypatch.setenv("COMPOSIO_CACHE_DIR", str(unusable_cache_dir))

    with pytest.raises(RuntimeError, match="COMPOSIO_CACHE_DIR"):
        _files.ensure_cache_directory()


def test_legacy_module_constants_still_resolve(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """``LOCAL_CACHE_DIRECTORY`` was public-ish; keep it importable (PEP 562)."""
    monkeypatch.setenv("COMPOSIO_CACHE_DIR", str(tmp_path / "cache"))

    assert _files.LOCAL_CACHE_DIRECTORY == tmp_path / "cache"
    assert _files.LOCAL_OUTPUT_FILE_DIRECTORY == tmp_path / "cache" / "files"

    # And unlike the old module-level constants, they track the environment.
    monkeypatch.setenv("COMPOSIO_CACHE_DIR", str(tmp_path / "other"))
    assert _files.LOCAL_CACHE_DIRECTORY == tmp_path / "other"


def test_unknown_module_attribute_still_raises_attribute_error() -> None:
    """The module ``__getattr__`` must not swallow genuine typos."""
    with pytest.raises(AttributeError, match="no attribute"):
        _files.LOCAL_CACHE_DIRECTROY  # noqa: B018  (deliberate typo)
