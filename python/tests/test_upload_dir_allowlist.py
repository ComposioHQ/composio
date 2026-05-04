"""Tests for the auto-upload directory allowlist (parity with TS sdk)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

from composio.core.models.base import allow_tracking
from composio.exceptions import (
    FileUploadPathNotAllowedError,
    SDKFileNotFoundError,
)
from composio.utils.upload_dir_allowlist import (
    assert_path_inside_upload_dirs,
    get_default_upload_dir,
    resolve_effective_upload_allowlist,
)


@pytest.fixture(autouse=True)
def disable_telemetry():
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


class TestResolveEffectiveUploadAllowlist:
    def test_none_returns_default(self):
        result = resolve_effective_upload_allowlist(None)
        default = get_default_upload_dir()
        assert default is not None, "Expected a default upload dir in this env."
        assert result == [default]

    def test_empty_list_replaces_default(self):
        assert resolve_effective_upload_allowlist([]) == []

    def test_false_means_no_local_paths(self):
        # Explicit "reject all local paths during auto-upload". Equivalent to []
        # but reads better at call sites.
        assert resolve_effective_upload_allowlist(False) == []

    def test_explicit_list_replaces_default(self, tmp_path: Path):
        result = resolve_effective_upload_allowlist([str(tmp_path)])
        assert result == [tmp_path.resolve()]

    def test_tilde_is_expanded(self):
        result = resolve_effective_upload_allowlist(["~"])
        assert result == [Path.home().resolve()]

    def test_skips_blank_and_non_string_entries(self, tmp_path: Path):
        result = resolve_effective_upload_allowlist([str(tmp_path), "", "   "])
        assert result == [tmp_path.resolve()]

    def test_deduplicates_entries(self, tmp_path: Path):
        result = resolve_effective_upload_allowlist([str(tmp_path), str(tmp_path)])
        assert result == [tmp_path.resolve()]


class TestAssertPathInsideUploadDirs:
    def test_accepts_direct_child(self, tmp_path: Path):
        allowed = tmp_path
        f = allowed / "a.txt"
        f.write_text("hi")
        assert_path_inside_upload_dirs(str(f), [allowed])

    def test_accepts_nested_child(self, tmp_path: Path):
        allowed = tmp_path
        nested = allowed / "sub" / "deeper"
        nested.mkdir(parents=True)
        f = nested / "a.txt"
        f.write_text("hi")
        assert_path_inside_upload_dirs(str(f), [allowed])

    def test_rejects_path_outside(self, tmp_path: Path):
        allowed = tmp_path / "inside"
        outside = tmp_path / "outside"
        allowed.mkdir()
        outside.mkdir()
        f = outside / "a.txt"
        f.write_text("hi")
        with pytest.raises(FileUploadPathNotAllowedError):
            assert_path_inside_upload_dirs(str(f), [allowed])

    def test_enforces_component_boundary(self, tmp_path: Path):
        # /tmp/foo must NOT accept /tmp/foo-bar/x.
        allowed = tmp_path / "foo"
        sibling = tmp_path / "foo-bar"
        allowed.mkdir()
        sibling.mkdir()
        f = sibling / "x.txt"
        f.write_text("hi")
        with pytest.raises(FileUploadPathNotAllowedError):
            assert_path_inside_upload_dirs(str(f), [allowed])

    def test_raises_not_found_when_missing(self, tmp_path: Path):
        allowed = tmp_path
        missing = tmp_path / "does_not_exist.txt"
        with pytest.raises(SDKFileNotFoundError) as excinfo:
            assert_path_inside_upload_dirs(str(missing), [allowed])
        assert "does not exist on disk" in str(excinfo.value)
        assert "file_upload_dirs" in str(excinfo.value)

    def test_empty_allowlist_fails_closed(self, tmp_path: Path):
        f = tmp_path / "a.txt"
        f.write_text("hi")
        with pytest.raises(FileUploadPathNotAllowedError) as excinfo:
            assert_path_inside_upload_dirs(str(f), [])
        msg = str(excinfo.value)
        assert "no upload directories are configured" in msg
        assert "dangerously_allow_auto_upload_download_files" in msg

    def test_error_message_lists_allowlist(self, tmp_path: Path):
        allowed = tmp_path / "inside"
        outside = tmp_path / "outside"
        allowed.mkdir()
        outside.mkdir()
        f = outside / "a.txt"
        f.write_text("hi")
        with pytest.raises(FileUploadPathNotAllowedError) as excinfo:
            assert_path_inside_upload_dirs(str(f), [allowed])
        msg = str(excinfo.value)
        assert str(allowed) in msg
        assert "file_upload_dirs" in msg
        assert "dangerously_allow_auto_upload_download_files" in msg

    @pytest.mark.skipif(sys.platform == "win32", reason="POSIX-only symlink semantics")
    def test_rejects_symlink_pointing_outside(self, tmp_path: Path):
        allowed = tmp_path / "inside"
        outside = tmp_path / "outside"
        allowed.mkdir()
        outside.mkdir()
        secret = outside / "secret.txt"
        secret.write_text("pw")
        link = allowed / "link.txt"
        os.symlink(secret, link)

        with pytest.raises(FileUploadPathNotAllowedError):
            assert_path_inside_upload_dirs(str(link), [allowed])


class TestToolsWiresAllowlistCorrectly:
    """Verifies ``Tools`` forwards the right allowlist to ``FileHelper`` given
    the full flag/value matrix."""

    @staticmethod
    def _make_tools(
        dangerously_allow_auto_upload_download_files: bool,
        file_upload_dirs,
    ):
        from composio.core.models.tools import Tools
        from unittest.mock import Mock

        return Tools(
            client=Mock(),
            provider=Mock(name="provider"),
            dangerously_allow_auto_upload_download_files=dangerously_allow_auto_upload_download_files,
            file_upload_dirs=file_upload_dirs,
        )

    def test_flag_off_means_no_allowlist_is_ever_built(self):
        # Flag off ⇒ auto-upload code path is never run. We pass ``None`` to
        # FileHelper so manual/no-op paths don't accidentally enforce anything.
        t = self._make_tools(False, None)
        assert t._file_helper._file_upload_allowlist is None  # noqa: SLF001

    def test_flag_off_ignores_file_upload_dirs_entirely(self):
        t = self._make_tools(False, ["/tmp/whatever"])
        assert t._file_helper._file_upload_allowlist is None  # noqa: SLF001

        t = self._make_tools(False, False)
        assert t._file_helper._file_upload_allowlist is None  # noqa: SLF001

        t = self._make_tools(False, [])
        assert t._file_helper._file_upload_allowlist is None  # noqa: SLF001

    def test_flag_on_none_uses_default(self):
        t = self._make_tools(True, None)
        assert t._file_helper._file_upload_allowlist == [  # noqa: SLF001
            get_default_upload_dir()
        ]

    def test_flag_on_false_means_empty_allowlist(self):
        t = self._make_tools(True, False)
        assert t._file_helper._file_upload_allowlist == []  # noqa: SLF001

    def test_flag_on_empty_list_means_empty_allowlist(self):
        t = self._make_tools(True, [])
        assert t._file_helper._file_upload_allowlist == []  # noqa: SLF001

    def test_flag_on_explicit_dirs_replace_default(self, tmp_path: Path):
        t = self._make_tools(True, [str(tmp_path)])
        assert t._file_helper._file_upload_allowlist == [  # noqa: SLF001
            tmp_path.resolve()
        ]


class TestFileUploadableAllowlistWiring:
    """Sanity: FileUploadable.from_path must honor the allowlist param."""

    def test_from_path_with_allowlist_blocks_outside(self, tmp_path: Path):
        from composio.core.models._files import FileUploadable
        from unittest.mock import Mock

        inside = tmp_path / "inside"
        outside = tmp_path / "outside"
        inside.mkdir()
        outside.mkdir()
        f = outside / "a.txt"
        f.write_text("hi")

        with pytest.raises(FileUploadPathNotAllowedError):
            FileUploadable.from_path(
                client=Mock(),
                file=str(f),
                tool="T",
                toolkit="tk",
                file_upload_allowlist=[inside],
            )

    def test_from_path_without_allowlist_skips_check(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Passing ``file_upload_allowlist=None`` must NOT trigger the check.

        This simulates manual upload paths and the no-auto-upload default.
        """
        from composio.core.models import _files as files_mod
        from composio.core.models._files import FileUploadable
        from unittest.mock import Mock

        f = tmp_path / "a.txt"
        f.write_text("hi")

        # Short-circuit the network-bound parts.
        mock_client = Mock()
        mock_client.post.return_value = Mock(
            new_presigned_url="https://example/upload", key="k"
        )
        monkeypatch.setattr(files_mod, "upload", lambda url, file: True)

        result = FileUploadable.from_path(
            client=mock_client,
            file=str(f),
            tool="T",
            toolkit="tk",
            file_upload_allowlist=None,
        )
        assert result.s3key == "k"
