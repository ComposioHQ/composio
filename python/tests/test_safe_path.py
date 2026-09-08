"""Tests for the path containment primitives in `composio.utils.safe_path`.

See that module's docstring for why containment must be anchored on a constant
root rather than on a directory the input helped build.
"""

import sys
from pathlib import Path

import pytest

from composio.exceptions import UnsafePathComponentError
from composio.utils.safe_path import (
    SAFE_COMPONENT_REGEX,
    assert_safe_path_component,
    is_inside_dir,
    resolve_root,
    safe_basename,
    secure_basename_join,
    secure_join,
)


class TestResolveRoot:
    """Both ends of a containment check must normalize through this one
    function; when they diverge the check compares mismatched paths."""

    def test_expands_tilde(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HOME", str(tmp_path))
        assert resolve_root("~/downloads") == (tmp_path / "downloads").resolve()

    def test_resolves_relative(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        assert resolve_root("./downloads") == (tmp_path / "downloads").resolve()

    def test_accepts_path_and_str_identically(self, tmp_path):
        assert resolve_root(tmp_path) == resolve_root(str(tmp_path))

    def test_nonexistent_root_does_not_raise(self, tmp_path):
        assert resolve_root(tmp_path / "nope") == (tmp_path / "nope").resolve()


class TestAssertSafePathComponent:
    @pytest.mark.parametrize(
        "value",
        [
            "GMAIL",
            "GMAIL_GET_ATTACHMENT",
            "github",
            "some-toolkit",
            "v2",
            "a",
            "A1_b-2",
        ],
    )
    def test_accepts_realistic_slugs(self, value):
        assert assert_safe_path_component(value) == value

    @pytest.mark.parametrize(
        "value",
        [
            "..",
            ".",
            "../etc",
            "../../../../../etc/escaped",
            "a/b",
            "a\\b",
            "..\\..\\evil",
            "/etc",
            "/",
            "C:\\Windows",
            "C:/Windows",
            "",
            "a\x00b",
            "a b",
            "a.b",
            "café",
            "x" * 129,
        ],
    )
    def test_rejects_unsafe_values(self, value):
        with pytest.raises(UnsafePathComponentError):
            assert_safe_path_component(value)

    @pytest.mark.parametrize("value", ["GMAIL\n", "GMAIL\r\n", "GMAIL\x0b", "\nGMAIL"])
    def test_rejects_control_characters(self, value):
        """`re.match` with a `$` anchor also matches just before a single
        trailing newline, so `"GMAIL\\n"` satisfied the pattern and reached the
        filesystem. `fullmatch` is what closes that."""
        with pytest.raises(UnsafePathComponentError):
            assert_safe_path_component(value)

    @pytest.mark.parametrize("value", ["CON", "con", "NUL", "COM1", "lpt9", "AUX"])
    def test_rejects_windows_device_names_on_every_platform(self, value):
        """Rejected regardless of host OS so a POSIX test run cannot pass code
        that would target a device on a Windows deployment."""
        with pytest.raises(UnsafePathComponentError, match="reserved device name"):
            assert_safe_path_component(value)

    def test_rejects_non_string(self):
        with pytest.raises(UnsafePathComponentError):
            assert_safe_path_component(None)  # type: ignore[arg-type]

    def test_label_appears_in_the_error(self):
        with pytest.raises(UnsafePathComponentError, match="tool slug"):
            assert_safe_path_component("../x", label="tool slug")

    def test_boundary_length(self):
        assert assert_safe_path_component("x" * 128) == "x" * 128
        with pytest.raises(UnsafePathComponentError, match="longer than"):
            assert_safe_path_component("x" * 129)

    def test_matches_the_custom_tool_slug_pattern(self):
        """The SDK already enforced this pattern on client-created custom
        tools; backend-fetched tools are now held to the same standard."""
        from composio.core.models.custom_tool_types import SLUG_REGEX

        assert SAFE_COMPONENT_REGEX.pattern == SLUG_REGEX.pattern


class TestIsInsideDir:
    def test_nested_path_is_inside(self, tmp_path):
        assert is_inside_dir(tmp_path / "a" / "b", tmp_path)

    def test_same_path_is_inside(self, tmp_path):
        assert is_inside_dir(tmp_path, tmp_path)

    def test_sibling_prefix_is_not_inside(self, tmp_path):
        """`/tmp/foo` must not be treated as containing `/tmp/foo-bar`. A plain
        string prefix check gets this wrong."""
        assert not is_inside_dir(Path(f"{tmp_path}-evil") / "x", tmp_path)

    def test_parent_is_not_inside(self, tmp_path):
        assert not is_inside_dir(tmp_path.parent, tmp_path)

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-only casing rule")
    def test_case_insensitive_on_windows(self):
        assert is_inside_dir(Path("C:\\Foo\\Bar"), Path("c:\\foo"))


class TestSafeBasename:
    @pytest.mark.parametrize(
        "value",
        ["NUL.tar.gz", "COM1.log.bak", "COM¹.txt", "LPT³.data"],
    )
    def test_rejects_windows_device_names_with_any_extension(self, value):
        with pytest.raises(UnsafePathComponentError, match="reserved device name"):
            safe_basename(value)

    @pytest.mark.parametrize(
        "value",
        ["report?.txt", "report.txt:payload", "report.txt.", "report.txt "],
    )
    def test_rejects_windows_invalid_names_on_every_platform(self, value):
        with pytest.raises(UnsafePathComponentError):
            safe_basename(value)

    def test_limits_encoded_filename_bytes(self):
        with pytest.raises(UnsafePathComponentError, match="longer than"):
            safe_basename("😀" * 128)

    def test_rejects_unencodable_filename(self):
        with pytest.raises(UnsafePathComponentError, match="invalid Unicode"):
            safe_basename("report-\ud800.txt")


class TestSecureBasenameJoin:
    def test_tilde_base_is_expanded_before_containment(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HOME", str(tmp_path))
        assert (
            secure_basename_join("~/downloads", "report.pdf")
            == (tmp_path / "downloads" / "report.pdf").resolve()
        )


class TestSecureJoin:
    def test_joins_safe_components(self, tmp_path):
        assert (
            secure_join(tmp_path, "GMAIL", "GMAIL_GET_ATTACHMENT")
            == (tmp_path / "GMAIL" / "GMAIL_GET_ATTACHMENT").resolve()
        )

    def test_no_components_returns_the_root(self, tmp_path):
        assert secure_join(tmp_path) == tmp_path.resolve()

    @pytest.mark.parametrize("component", ["..", "../etc", "/etc", "a/b", "..\\evil"])
    def test_rejects_traversal_components(self, component, tmp_path):
        with pytest.raises(UnsafePathComponentError):
            secure_join(tmp_path, component)

    def test_rejects_traversal_in_any_position(self, tmp_path):
        with pytest.raises(UnsafePathComponentError):
            secure_join(tmp_path, "GMAIL", "..")

    def test_creates_nothing_on_disk(self, tmp_path):
        """Validation must complete before any filesystem write, so a rejected
        join leaves no attacker-chosen directories behind."""
        root = tmp_path / "root"
        root.mkdir()
        with pytest.raises(UnsafePathComponentError):
            secure_join(root, "../evil")
        assert list(root.iterdir()) == []

        secure_join(root, "GMAIL", "TOOL")
        assert list(root.iterdir()) == []

    def test_symlink_escape_is_caught_after_resolve(self, tmp_path):
        """Per-component validation cannot see a symlink pointing out of the
        root; the post-resolve containment check is what catches it."""
        root = tmp_path / "root"
        root.mkdir()
        outside = tmp_path / "outside"
        outside.mkdir()
        (root / "GMAIL").symlink_to(outside, target_is_directory=True)

        with pytest.raises(UnsafePathComponentError, match="outside"):
            secure_join(root, "GMAIL", "TOOL")

    def test_root_is_expanded_and_resolved(self, tmp_path):
        nested = tmp_path / "a" / ".." / "b"
        (tmp_path / "b").mkdir(parents=True)
        assert secure_join(nested, "TOOL") == (tmp_path / "b" / "TOOL").resolve()

    def test_accepts_str_root(self, tmp_path):
        assert secure_join(str(tmp_path), "TOOL") == (tmp_path / "TOOL").resolve()

    def test_tilde_root_is_expanded(self, tmp_path, monkeypatch):
        """`~` must expand identically here and in every containment check that
        shares this root, or a legitimate download is rejected as an attack."""
        monkeypatch.setenv("HOME", str(tmp_path))
        assert (
            secure_join("~/downloads", "GMAIL")
            == (tmp_path / "downloads" / "GMAIL").resolve()
        )

    def test_nonexistent_root_still_validates(self, tmp_path):
        """`resolve(strict=False)` means the root need not exist yet — the
        download directory is created lazily."""
        root = tmp_path / "not-created-yet"
        assert secure_join(root, "TOOL") == (root / "TOOL").resolve()
        with pytest.raises(UnsafePathComponentError):
            secure_join(root, "..")
