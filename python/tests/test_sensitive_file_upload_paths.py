"""Tests for composio.utils.sensitive_file_upload_paths."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from composio.exceptions import SensitiveFilePathBlockedError
from composio.utils.sensitive_file_upload_paths import (
    assert_safe_local_file_upload_path,
    is_blocked_sensitive_file_upload_path,
)


def test_allows_normal_project_files() -> None:
    p = Path("/tmp") / "composio-test" / "document.pdf"
    assert is_blocked_sensitive_file_upload_path(p) is False
    assert_safe_local_file_upload_path(p)


def test_blocks_common_credential_directory_segments() -> None:
    home = Path.home()
    assert is_blocked_sensitive_file_upload_path(home / ".aws" / "credentials") is True
    assert is_blocked_sensitive_file_upload_path(home / ".ssh" / "id_ed25519") is True
    assert (
        is_blocked_sensitive_file_upload_path(home / ".claude" / "settings.json")
        is True
    )


def test_blocks_env_style_basenames() -> None:
    assert is_blocked_sensitive_file_upload_path(Path("/app/repo/.env")) is True
    assert is_blocked_sensitive_file_upload_path(Path("/app/repo/.env.local")) is True


def test_blocks_default_private_key_basenames() -> None:
    assert is_blocked_sensitive_file_upload_path(Path("/tmp/id_ed25519")) is True


def test_allows_public_key_by_basename() -> None:
    assert is_blocked_sensitive_file_upload_path(Path("/tmp/id_ed25519.pub")) is False


def test_honors_additional_deny_segments() -> None:
    assert (
        is_blocked_sensitive_file_upload_path(
            Path("/data/secrets/x.txt"), additional_deny_segments=["secrets"]
        )
        is True
    )
    assert (
        is_blocked_sensitive_file_upload_path(
            Path("/data/ok/x.txt"), additional_deny_segments=["secrets"]
        )
        is False
    )


def test_blocks_after_symlink_resolves_to_sensitive_dir() -> None:
    with tempfile.TemporaryDirectory() as root:
        root_p = Path(root)
        aws_dir = root_p / "nested" / ".aws"
        aws_dir.mkdir(parents=True)
        target = aws_dir / "creds"
        target.write_text("x", encoding="utf-8")
        link = root_p / "innocent-name"
        try:
            link.symlink_to(target)
        except OSError:
            pytest.skip("symlinks not supported")
        assert is_blocked_sensitive_file_upload_path(link) is True


def test_assert_safe_raises() -> None:
    p = Path.home() / ".ssh" / "id_rsa"
    with pytest.raises(SensitiveFilePathBlockedError):
        assert_safe_local_file_upload_path(p)
