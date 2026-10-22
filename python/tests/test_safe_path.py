"""Tests for the path containment primitives in `composio.utils.safe_path`.

See that module's docstring for why containment must be anchored on a constant
root rather than on a directory the input helped build.
"""

import re
import sys
from pathlib import Path

import pytest

from composio.exceptions import UnsafePathComponentError
from composio.utils.safe_path import (
    MAX_COMPONENT_LENGTH,
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


TAG_BYTES = 17
"""Bytes a changed name gains: ``-`` and 16 hex digits of the original's
digest."""


def tagged(stem: str, extension: str = "") -> "re.Pattern[str]":
    """Match ``stem``, the digest tag of a changed name, then ``extension``."""
    return re.compile(re.escape(stem) + "-[0-9a-f]{16}" + re.escape(extension))


class TestSafeBasename:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("report.pdf", "report.pdf"),
            ("output/report.pdf", "report.pdf"),
            ("archive.tar.gz", "archive.tar.gz"),
            (".gitignore", ".gitignore"),
            ("..\\..\\evil", "evil"),
            (" report.pdf", "report.pdf"),
            ("report.pdf ", "report.pdf"),
            ("\x1creport.txt\x1f", "report.txt"),
            ("café.txt", "café.txt"),
            ("C:report.txt", "report.txt"),
            ("\ufeffreport.txt", "\ufeffreport.txt"),
            ("\u0085report.txt\u0085", "report.txt"),
        ],
    )
    def test_reduces_to_the_basename(self, value, expected):
        assert safe_basename(value) == expected

    @pytest.mark.parametrize("value", ["", ".", "..", "...", "foo/..", "/", "   "])
    def test_rejects_names_with_no_usable_basename(self, value):
        with pytest.raises(UnsafePathComponentError, match="no usable basename"):
            safe_basename(value)

    @pytest.mark.parametrize(
        "value",
        ["\u00a0.\u00a0", ".\u00a0", "\u00a0.", "\u2007..\u2007", "\u2028.\u2029"],
    )
    def test_rejects_whitespace_wrapped_dot_runs(self, value):
        """``str.strip`` removes Unicode whitespace, so these are written as
        ``.`` or ``..``: the usability check must see the stripped value."""
        with pytest.raises(UnsafePathComponentError, match="no usable basename"):
            safe_basename(value)

    @pytest.mark.parametrize("value", [". .", ".. ", " . . "])
    def test_rejects_dot_runs_once_windows_trims_them(self, value):
        with pytest.raises(UnsafePathComponentError, match="no usable basename"):
            safe_basename(value)

    def test_rejects_nul_byte(self):
        with pytest.raises(UnsafePathComponentError, match="NUL byte"):
            safe_basename("report\x00.pdf")

    @pytest.mark.parametrize(
        ("value", "stem", "extension"),
        [
            ("report_2026-09-29T10:30:00.csv", "report_2026-09-29T10_30_00", ".csv"),
            ("What is this?.png", "What is this_", ".png"),
            ('invoice "final".pdf', "invoice _final_", ".pdf"),
            ("report.txt:payload", "report", ".txt_payload"),
            ("report<1>.txt", "report_1_", ".txt"),
            ("a|b*.txt", "a_b_", ".txt"),
            ("tab\there.txt", "tab_here", ".txt"),
            ("output/C:report.txt", "C_report", ".txt"),
        ],
    )
    def test_replaces_windows_reserved_characters(self, value, stem, extension):
        assert tagged(stem, extension).fullmatch(safe_basename(value))

    @pytest.mark.parametrize(
        ("value", "stem", "extension"),
        [
            ("report.txt.", "report", ".txt"),
            ("report. .", "report", ""),
            ("report.\u00a0", "report", ""),
            ("report.\u0085", "report", ""),
            ("\ufeff..", "\ufeff", ""),
        ],
    )
    def test_drops_trailing_spaces_and_dots(self, value, stem, extension):
        assert tagged(stem, extension).fullmatch(safe_basename(value))

    @pytest.mark.parametrize(
        ("value", "stem", "extension"),
        [
            ("NUL", "_NUL", ""),
            ("nul", "_nul", ""),
            ("NUL.tar.gz", "_NUL.tar", ".gz"),
            ("COM1.log.bak", "_COM1.log", ".bak"),
            ("COM¹.txt", "_COM¹", ".txt"),
            ("LPT³.data", "_LPT³", ".data"),
            ("aux.txt", "_aux", ".txt"),
            ("CON .txt", "_CON ", ".txt"),
            ("COM1:.txt", "COM1_", ".txt"),
        ],
    )
    def test_prefixes_windows_device_names_with_any_extension(
        self, value, stem, extension
    ):
        assert tagged(stem, extension).fullmatch(safe_basename(value))

    def test_prefixes_a_device_name_exposed_by_truncation(self):
        # Truncation keeps `NUL` plus spaces before `.txt`, and Windows ignores
        # the spaces, so the checked name must be the fitted one.
        spaces = " " * (MAX_COMPONENT_LENGTH - TAG_BYTES - 8)
        assert tagged("_NUL" + spaces, ".txt").fullmatch(
            safe_basename("NUL" + " " * 200 + "x.txt")
        )
        assert tagged("_CON").fullmatch(safe_basename("CON" + " " * 200 + "x"))

    def test_keeps_a_filename_at_the_byte_limit(self):
        name = "x" * MAX_COMPONENT_LENGTH
        assert safe_basename(name) == name

    def test_truncates_to_the_byte_limit_and_keeps_the_extension(self):
        result = safe_basename("x" * 200 + ".pdf")
        assert tagged("x" * (MAX_COMPONENT_LENGTH - TAG_BYTES - 4), ".pdf").fullmatch(
            result
        )
        assert len(result) == MAX_COMPONENT_LENGTH

    def test_truncates_by_whole_code_points_measured_in_bytes(self):
        cjk = safe_basename("請" * 70 + ".pdf")
        assert tagged("請" * 35, ".pdf").fullmatch(cjk)
        assert len(cjk.encode()) <= MAX_COMPONENT_LENGTH
        assert tagged("😀" * 27).fullmatch(safe_basename("😀" * 33))

    def test_truncates_an_over_long_extension_with_the_rest(self):
        stem = "report." + "x" * (MAX_COMPONENT_LENGTH - TAG_BYTES - 7)
        assert tagged(stem).fullmatch(safe_basename("report." + "x" * 200))

    def test_drops_a_trailing_dot_exposed_by_truncation(self):
        name = "x" * (MAX_COMPONENT_LENGTH - 1) + "." + "y" * 40
        assert tagged("x" * (MAX_COMPONENT_LENGTH - TAG_BYTES)).fullmatch(
            safe_basename(name)
        )

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            # safePath.test.ts asserts the same vectors, so both SDKs write a
            # given server name to the same file.
            ("report?.png", "report_-05fcb95aa5b918e9.png"),
            ("report*.png", "report_-aa921bdab2b33292.png"),
            (
                "report_2026-09-29T10:30:00.csv",
                "report_2026-09-29T10_30_00-d7211bb25cb815fe.csv",
            ),
            ("NUL.txt", "_NUL-d0848f78ce05ded6.txt"),
        ],
    )
    def test_tags_a_changed_name_with_a_digest_of_the_original(self, value, expected):
        assert safe_basename(value) == expected

    def test_distinct_names_that_normalize_alike_stay_distinct(self):
        names = ["report?.png", "report*.png", "report:.png", "report_.png"]
        assert len({safe_basename(name) for name in names}) == len(names)

    def test_distinct_long_names_sharing_a_truncated_prefix_stay_distinct(self):
        prefix = "a" * 200
        assert safe_basename(prefix + "-1.txt") != safe_basename(prefix + "-2.txt")

    def test_returns_an_already_portable_name_unchanged(self):
        assert safe_basename("report_.png") == "report_.png"

    def test_treats_a_tagged_name_as_already_portable(self):
        written = safe_basename("report?.png")
        assert safe_basename(written) == written

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
