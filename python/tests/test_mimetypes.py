"""Tests for the mimetypes utility module."""

from pathlib import Path

import pytest

from composio.utils.mimetypes import (
    _default,
    get_extension_from_mime_type,
    guess,
)


class TestGuess:
    """Test cases for guess() (filename/extension -> MIME type)."""

    @pytest.mark.parametrize(
        ("filename", "expected"),
        [
            ("a.json", "application/json"),
            ("a.html", "text/html"),
            ("a.txt", "text/plain"),
            ("a.pdf", "application/pdf"),
            ("a.css", "text/css"),
            ("a.js", "application/javascript"),
            ("a.png", "image/png"),
            ("a.gif", "image/gif"),
            ("a.mp4", "video/mp4"),
            ("a.zip", "application/zip"),
        ],
    )
    def test_known_extensions(self, filename: str, expected: str) -> None:
        """A known extension resolves to its MIME type."""
        assert guess(filename) == expected

    def test_extension_lookup_is_case_sensitive(self) -> None:
        """The extension table is lower-case, so an upper-case suffix misses."""
        assert guess("photo.PNG") == _default

    def test_unknown_extension_returns_default(self) -> None:
        assert guess("file.unknownext") == _default

    def test_no_extension_returns_default(self) -> None:
        assert guess("noextension") == _default

    def test_uses_only_the_final_suffix(self) -> None:
        # Path().suffix is the last component, so ".gz" here, not ".tar.gz".
        assert guess("archive.tar.gz") == guess("archive.gz")

    def test_accepts_path_objects(self) -> None:
        assert guess(Path("dir/sub/a.png")) == "image/png"


class TestGetExtensionFromMimeType:
    """Test cases for get_extension_from_mime_type() (MIME type -> extension)."""

    @pytest.mark.parametrize(
        ("mime_type", "expected"),
        [
            ("image/png", "png"),
            ("application/json", "json"),
            ("text/html", "html"),
            ("application/pdf", "pdf"),
            ("image/jpeg", "jpg"),
            ("video/mp4", "mp4"),
            ("application/vnd.ms-excel", "xls"),
        ],
    )
    def test_direct_mapping(self, mime_type: str, expected: str) -> None:
        assert get_extension_from_mime_type(mime_type) == expected

    def test_strips_parameters(self) -> None:
        assert get_extension_from_mime_type("text/plain; charset=utf-8") == "txt"

    def test_is_case_insensitive(self) -> None:
        assert get_extension_from_mime_type("APPLICATION/JSON") == "json"

    def test_surrounding_whitespace_is_ignored(self) -> None:
        assert get_extension_from_mime_type("  image/png  ") == "png"

    @pytest.mark.parametrize(
        ("mime_type", "expected"),
        [
            ("application/atom+xml", "atom"),
            ("application/rss+xml", "rss"),
        ],
    )
    def test_structured_suffix_known_prefix(
        self, mime_type: str, expected: str
    ) -> None:
        """For known prefixes the prefix wins over the suffix."""
        assert get_extension_from_mime_type(mime_type) == expected

    def test_structured_suffix_uses_suffix(self) -> None:
        """A '+json'/'+xml' style suffix maps to that structured format."""
        assert get_extension_from_mime_type("application/vnd.api+json") == "json"

    def test_structured_suffix_unknown_falls_back_to_suffix(self) -> None:
        assert get_extension_from_mime_type("application/foo+bar") == "bar"

    def test_unknown_type_uses_subtype(self) -> None:
        assert get_extension_from_mime_type("application/x-custom") == "x-custom"
        assert get_extension_from_mime_type("totally/unknown") == "unknown"

    def test_empty_subtype_defaults_to_txt(self) -> None:
        assert get_extension_from_mime_type("application/") == "txt"

    def test_no_subtype_defaults_to_bin(self) -> None:
        assert get_extension_from_mime_type("notamimetype") == "bin"
        assert get_extension_from_mime_type("") == "bin"
