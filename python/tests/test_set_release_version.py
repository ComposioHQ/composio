"""Regression tests for deterministic Python release-family versioning."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "set-release-version.py"


def _write(path: Path, contents: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents, encoding="utf-8")


def _release_fixture(
    root: Path,
    *,
    runtime_version: str = "1.2.3",
    missing_setup: str | None = None,
) -> Path:
    _write(root / "pyproject.toml", '[project]\nname = "composio"\nversion = "1.2.3"\n')
    _write(
        root / "composio" / "__version__.py",
        f'__version__ = "{runtime_version}"\n',
    )
    for provider in ("alpha", "beta"):
        _write(
            root / "providers" / provider / "pyproject.toml",
            f'[project]\nname = "composio-{provider}"\nversion = "1.2.3"\n',
        )
        if provider != missing_setup:
            _write(
                root / "providers" / provider / "setup.py",
                "from setuptools import setup\n"
                "setup(\n"
                f'    name="composio_{provider}",\n'
                '    version="1.2.3",\n'
                ")\n",
            )
    return root


def _run_setter(root: Path, version: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--python-root",
            str(root),
            "--version",
            version,
        ],
        capture_output=True,
        check=False,
        text=True,
    )


def _snapshot(root: Path) -> dict[str, bytes]:
    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def test_sets_exact_version_across_release_family_and_is_idempotent(
    tmp_path: Path,
) -> None:
    root = _release_fixture(tmp_path / "python")

    first = _run_setter(root, "2.0.0")

    assert first.returncode == 0, first.stderr
    assert json.loads(first.stdout) == {
        "packages": [
            {"name": "composio", "version": "2.0.0"},
            {"name": "composio-alpha", "version": "2.0.0"},
            {"name": "composio-beta", "version": "2.0.0"},
        ]
    }
    expected_version_lines = {
        "pyproject.toml": 'version = "2.0.0"',
        "composio/__version__.py": '__version__ = "2.0.0"',
        "providers/alpha/pyproject.toml": 'version = "2.0.0"',
        "providers/alpha/setup.py": 'version="2.0.0"',
        "providers/beta/pyproject.toml": 'version = "2.0.0"',
        "providers/beta/setup.py": 'version="2.0.0"',
    }
    for relative_path, version_line in expected_version_lines.items():
        assert version_line in (root / relative_path).read_text(encoding="utf-8")

    after_first = _snapshot(root)
    second = _run_setter(root, "2.0.0")

    assert second.returncode == 0, second.stderr
    assert _snapshot(root) == after_first


def test_missing_provider_metadata_fails_before_mutation(tmp_path: Path) -> None:
    root = _release_fixture(tmp_path / "python", missing_setup="beta")
    before = _snapshot(root)

    result = _run_setter(root, "2.0.0")

    assert result.returncode != 0
    assert "providers/beta/setup.py" in result.stderr
    assert _snapshot(root) == before


def test_runtime_version_mismatch_fails_before_mutation(tmp_path: Path) -> None:
    root = _release_fixture(tmp_path / "python", runtime_version="1.2.2")
    before = _snapshot(root)

    result = _run_setter(root, "2.0.0")

    assert result.returncode != 0
    assert "runtime version 1.2.2 does not match core 1.2.3" in result.stderr
    assert _snapshot(root) == before
