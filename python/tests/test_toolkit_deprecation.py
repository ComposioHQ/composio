"""Parsing, formatting and once-per-process emission of the
``Composio-Deprecated-Toolkits`` response header.

The end-to-end path through ``Composio(...)`` and the generated client lives in
``tests/test_sdk_logging.py``; this file pins the pure helpers.
"""

import threading
import typing as t
import warnings
from datetime import datetime, timezone

import httpx
import pytest

from composio import ComposioDeprecationWarning
from composio.utils import toolkit_deprecation as td
from composio.utils.toolkit_deprecation import (
    DOCS_URL,
    HEADER,
    DeprecatedToolkit,
    format_warnings,
    install_hook,
    parse_deprecated_toolkits_header,
    response_hook,
    warn_deprecated_toolkits,
)

FULL_ITEM = (
    '"GMAIL";version="20250114_00";deprecated=@1779840000;'
    'sunset=@1787788800;reason="lifecycle"'
)
BARE_ITEM = '"STRAVA";version="20240902_00"'
DOCS = "https://docs.example/deprecation"


def _utc(seconds: int) -> datetime:
    return datetime.fromtimestamp(seconds, tz=timezone.utc)


def _entry(**overrides: t.Any) -> DeprecatedToolkit:
    values: dict[str, t.Any] = {"slug": "GMAIL", "version": "20250114_00"}
    values.update(overrides)
    return DeprecatedToolkit(**values)


@pytest.fixture(autouse=True)
def _reset_warned() -> t.Iterator[None]:
    td._reset_for_tests()
    yield
    td._reset_for_tests()


def _deprecations(caught: list[warnings.WarningMessage]) -> list[str]:
    return [
        str(w.message)
        for w in caught
        if issubclass(w.category, ComposioDeprecationWarning)
    ]


class TestParse:
    def test_full_item(self):
        assert parse_deprecated_toolkits_header(FULL_ITEM) == [
            DeprecatedToolkit(
                slug="GMAIL",
                version="20250114_00",
                deprecated_at=_utc(1779840000),
                sunset_at=_utc(1787788800),
                reason="lifecycle",
            )
        ]

    def test_dates_are_timezone_aware_utc(self):
        (entry,) = parse_deprecated_toolkits_header(FULL_ITEM)
        assert entry.deprecated_at is not None
        assert entry.deprecated_at.tzinfo is timezone.utc
        assert entry.deprecated_at.isoformat() == "2026-05-27T00:00:00+00:00"

    def test_bare_item(self):
        assert parse_deprecated_toolkits_header(BARE_ITEM) == [
            DeprecatedToolkit(slug="STRAVA", version="20240902_00")
        ]

    def test_two_items(self):
        entries = parse_deprecated_toolkits_header(f"{FULL_ITEM}, {BARE_ITEM}")
        assert [e.key for e in entries] == ["GMAIL@20250114_00", "STRAVA@20240902_00"]

    def test_escaped_quote_and_backslash_in_slug(self):
        entries = parse_deprecated_toolkits_header(
            '"ODD\\"SLUG\\\\";version="20250101_00", "GMAIL";version="20250114_00"'
        )
        assert [e.slug for e in entries] == ['ODD"SLUG\\', "GMAIL"]

    def test_whitespace_variations(self):
        entries = parse_deprecated_toolkits_header(
            '  "GMAIL" ; version = "20250114_00" ; sunset = @1787788800  ,'
            '"STRAVA";version="20240902_00"  '
        )
        assert entries == [
            DeprecatedToolkit(
                slug="GMAIL", version="20250114_00", sunset_at=_utc(1787788800)
            ),
            DeprecatedToolkit(slug="STRAVA", version="20240902_00"),
        ]

    @pytest.mark.parametrize(
        "value",
        [
            "",
            "   ",
            "not a structured field",
            "GMAIL;version=20250114_00",
            '"GMAIL";version="unterminated',
            ",,,;;;===",
            '"GMAIL;version=;;@@',
        ],
    )
    def test_garbage_yields_empty_list(self, value: str):
        assert parse_deprecated_toolkits_header(value) == []

    def test_unknown_parameters_are_ignored(self):
        assert parse_deprecated_toolkits_header(
            '"GMAIL";version="20250114_00";severity=3;flag;note="x"'
        ) == [DeprecatedToolkit(slug="GMAIL", version="20250114_00")]

    def test_empty_item_is_dropped_but_siblings_kept(self):
        assert parse_deprecated_toolkits_header('"GMAIL";version="1", ;;') == [
            DeprecatedToolkit(slug="GMAIL", version="1")
        ]

    def test_item_without_version_is_dropped_but_siblings_kept(self):
        assert parse_deprecated_toolkits_header(
            f'"GMAIL";deprecated=@1779840000, {BARE_ITEM}'
        ) == [DeprecatedToolkit(slug="STRAVA", version="20240902_00")]

    @pytest.mark.parametrize(
        "value",
        [
            '"GMAIL";version=20250114_00',
            '"GMAIL";version="1";deprecated="2026-05-27"',
            '"GMAIL";version="1";reason=lifecycle',
            '"GM\\nAIL";version="1"',
        ],
    )
    def test_wrong_type_or_bad_escape_drops_item(self, value: str):
        assert parse_deprecated_toolkits_header(value) == []


class TestFormat:
    def test_full_message(self):
        (line,) = format_warnings(parse_deprecated_toolkits_header(FULL_ITEM), DOCS)
        assert line == (
            "[Deprecation] Toolkit GMAIL version 20250114_00 was deprecated on "
            "2026-05-27 (lifecycle) and will stop working on 2026-08-27. "
            'Pin a newer version with toolkit_versions={"gmail": "<version>"} '
            f"or COMPOSIO_TOOLKIT_VERSION_GMAIL. See {DOCS}."
        )

    def test_omits_reason_and_sunset_when_absent(self):
        (line,) = format_warnings([_entry(slug="STRAVA", version="20240902_00")], DOCS)
        assert line == (
            "[Deprecation] Toolkit STRAVA version 20240902_00 was deprecated. "
            'Pin a newer version with toolkit_versions={"strava": "<version>"} '
            f"or COMPOSIO_TOOLKIT_VERSION_STRAVA. See {DOCS}."
        )

    def test_keeps_deprecation_date_when_only_sunset_missing(self):
        (line,) = format_warnings(
            [_entry(deprecated_at=_utc(1779840000), reason="security")], DOCS
        )
        assert "was deprecated on 2026-05-27 (security). Pin" in line
        assert "stop working" not in line

    def test_default_docs_url(self):
        (line,) = format_warnings([_entry()])
        assert line.endswith(f"See {DOCS_URL}.")
        assert DOCS_URL == (
            "https://docs.composio.dev/docs/tools-direct/toolkit-versioning"
            "#deprecation-and-sunset"
        )

    def test_groups_six_versions_into_one_line_naming_five(self):
        entries = [
            _entry(
                version=f"202501{suffix:02d}_00",
                sunset_at=datetime(2026, 8, 20 + suffix, tzinfo=timezone.utc),
            )
            for suffix in range(1, 7)
        ]
        lines = format_warnings(entries, DOCS)
        assert lines == [
            "[Deprecation] Toolkit GMAIL versions 20250101_00, 20250102_00, "
            "20250103_00, 20250104_00, 20250105_00 and 1 more are deprecated and "
            "the earliest will stop working on 2026-08-21. "
            'Pin a newer version with toolkit_versions={"gmail": "<version>"} '
            f"or COMPOSIO_TOOLKIT_VERSION_GMAIL. See {DOCS}."
        ]

    def test_one_line_per_slug_grouped_case_insensitively(self):
        lines = format_warnings(
            [
                _entry(slug="GMAIL", version="1"),
                _entry(slug="STRAVA", version="1"),
                _entry(slug="gmail", version="2"),
            ],
            DOCS,
        )
        assert len(lines) == 2
        assert "Toolkit GMAIL versions 1, 2 are deprecated." in lines[0]
        assert "Toolkit STRAVA version 1 was deprecated." in lines[1]

    def test_no_entries_no_lines(self):
        assert format_warnings([], DOCS) == []


class TestWarnOnce:
    def test_warns_once_per_key_across_calls(self):
        headers = httpx.Headers({HEADER: FULL_ITEM})
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            warn_deprecated_toolkits(headers)
            warn_deprecated_toolkits(headers)
        messages = _deprecations(caught)
        assert len(messages) == 1
        assert "GMAIL version 20250114_00" in messages[0]

    def test_second_version_still_warns_after_first_was_deduped(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            warn_deprecated_toolkits(
                httpx.Headers({HEADER: f"{FULL_ITEM}, {BARE_ITEM}"})
            )
            warn_deprecated_toolkits(
                httpx.Headers({HEADER: '"GMAIL";version="20250201_00"'})
            )
        assert len(_deprecations(caught)) == 3

    def test_header_name_is_case_insensitive(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            warn_deprecated_toolkits(
                httpx.Headers({"Composio-Deprecated-Toolkits": BARE_ITEM})
            )
        assert len(_deprecations(caught)) == 1

    def test_no_header_or_garbage_is_silent(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            warn_deprecated_toolkits(httpx.Headers({}))
            warn_deprecated_toolkits(httpx.Headers({HEADER: "%%% nope"}))
        assert _deprecations(caught) == []

    def test_reset_allows_warning_again(self):
        headers = httpx.Headers({HEADER: BARE_ITEM})
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            warn_deprecated_toolkits(headers)
            td._reset_for_tests()
            warn_deprecated_toolkits(headers)
        assert len(_deprecations(caught)) == 2

    def test_stops_recording_after_1024_keys_without_evicting(self):
        def send(version: int) -> None:
            warn_deprecated_toolkits(
                httpx.Headers({HEADER: f'"GMAIL";version="{version}"'})
            )

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            for version in range(1, 1025):
                send(version)
            assert len(_deprecations(caught)) == 1024
            send(1025)
            assert len(_deprecations(caught)) == 1024
            for version in range(1, 1025):
                send(version)
        assert len(_deprecations(caught)) == 1024
        assert len(td._warned) == 1024

    def test_two_threads_one_warning(self):
        headers = httpx.Headers({HEADER: FULL_ITEM})
        barrier = threading.Barrier(2)

        def worker() -> None:
            barrier.wait()
            warn_deprecated_toolkits(headers)

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            threads = [threading.Thread(target=worker) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
        assert len(_deprecations(caught)) == 1


class TestResponseHook:
    def test_warns_from_response_headers(self):
        response = httpx.Response(200, headers={HEADER: BARE_ITEM})
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            response_hook(response)
        assert len(_deprecations(caught)) == 1

    def test_oversized_header_is_ignored_and_body_kept(self):
        oversized = '"GMAIL";version="1";reason="' + "x" * 2048 + '"'
        response = httpx.Response(200, headers={HEADER: oversized}, json={})
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            response_hook(response)
        assert response.json() == {}
        assert _deprecations(caught) == []

    def test_control_character_in_header_is_ignored_and_body_kept(self):
        response = httpx.Response(
            200, headers={HEADER: '"GMAIL";version="1";reason="\x1b[2J"'}, json={}
        )
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            response_hook(response)
        assert response.json() == {}
        assert _deprecations(caught) == []

    def test_never_raises(self, caplog: pytest.LogCaptureFixture):
        class _Broken:
            @property
            def headers(self) -> httpx.Headers:
                raise RuntimeError("headers unavailable")

        with caplog.at_level("DEBUG", logger="composio.utils.toolkit_deprecation"):
            response_hook(t.cast(httpx.Response, _Broken()))
        assert "Failed to inspect the toolkit deprecation header" in caplog.text


class TestInstallHook:
    def test_appends_once(self):
        client = httpx.Client()
        install_hook(client)
        install_hook(client)
        assert client.event_hooks["response"] == [response_hook]

    def test_preserves_user_hooks(self):
        def user_request(request: httpx.Request) -> None:
            pass

        def user_response(response: httpx.Response) -> None:
            pass

        client = httpx.Client(
            event_hooks={"request": [user_request], "response": [user_response]}
        )
        install_hook(client)
        assert client.event_hooks["request"] == [user_request]
        assert client.event_hooks["response"] == [user_response, response_hook]

    def test_installed_hook_fires_on_send(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, headers={HEADER: BARE_ITEM}, json={})

        client = httpx.Client(transport=httpx.MockTransport(handler))
        install_hook(client)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            response = client.get("https://backend.invalid/api/v3/toolkits/strava")
        assert response.json() == {}
        assert len(_deprecations(caught)) == 1
