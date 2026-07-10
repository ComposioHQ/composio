"""Tests for the generic API deprecation interceptor in the HTTP client."""

import datetime
import warnings

import httpx
import pytest

from composio.client import (
    HttpClient,
    _build_deprecation_message,
    _normalize_path_template,
    _parse_deprecation_date,
    _parse_link_header,
    _parse_sunset_date,
)


@pytest.mark.core
class TestParsers:
    def test_parses_epoch_deprecation_date(self):
        parsed = _parse_deprecation_date("@1782345600")
        assert parsed == datetime.datetime.fromtimestamp(
            1782345600, tz=datetime.timezone.utc
        )

    def test_deprecation_literal_true_is_not_a_date(self):
        # Presence gates the warning; the value "true" is NOT required and is
        # not a parseable date.
        assert _parse_deprecation_date("true") is None

    def test_deprecation_date_garbage(self):
        assert _parse_deprecation_date("@notanumber") is None
        assert _parse_deprecation_date("") is None
        assert _parse_deprecation_date(None) is None

    def test_parses_sunset_http_date(self):
        parsed = _parse_sunset_date("Fri, 25 Sep 2026 00:00:00 GMT")
        assert parsed is not None
        assert parsed.year == 2026

    def test_sunset_invalid(self):
        assert _parse_sunset_date("nonsense") is None
        assert _parse_sunset_date(None) is None

    def test_link_successor_and_deprecation(self):
        header = (
            '</docs/changelog>; rel="deprecation", '
            '</api/v3/new>; rel="successor-version"'
        )
        assert _parse_link_header(header) == ("/api/v3/new", "/docs/changelog")

    def test_link_unquoted_and_empty(self):
        assert _parse_link_header("<https://d.co/x>; rel=successor-version") == (
            "https://d.co/x",
            None,
        )
        assert _parse_link_header(None) == (None, None)
        assert _parse_link_header('</x>; rel="prev"') == (None, None)

    def test_normalize_path_template(self):
        assert (
            _normalize_path_template("/api/v3/connected_accounts/ca_1a2b3c4d")
            == "/api/v3/connected_accounts/{param}"
        )
        assert (
            _normalize_path_template("/api/v3/users/12345") == "/api/v3/users/{param}"
        )
        assert (
            _normalize_path_template("/api/v3/connected_accounts")
            == "/api/v3/connected_accounts"
        )

    def test_build_message_escalates(self):
        op = "POST /api/v3/old"
        now = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
        past = datetime.datetime(2025, 1, 1, tzinfo=datetime.timezone.utc)
        future = datetime.datetime(2099, 1, 1, tzinfo=datetime.timezone.utc)

        assert "may already be unavailable" in _build_deprecation_message(
            op, past, None, None, None, now
        )
        assert "scheduled for removal" in _build_deprecation_message(
            op, future, None, None, None, now
        )
        assert "Use /api/v3/new instead" in _build_deprecation_message(
            op, None, None, "/api/v3/new", None, now
        )


@pytest.mark.core
class TestWarnIfDeprecated:
    def _client(self, **kwargs) -> HttpClient:
        return HttpClient(provider="test", api_key="test-key", **kwargs)

    def _response(
        self,
        headers: dict,
        method: str = "GET",
        url: str = "https://api.composio.dev/api/v3/old?x=1",
    ) -> httpx.Response:
        return httpx.Response(200, headers=headers, request=httpx.Request(method, url))

    def test_warns_on_deprecation_response(self):
        client = self._client()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            client._warn_if_deprecated(
                self._response({"Deprecation": "@1782345600"}, method="POST")
            )
        deprecations = [w for w in caught if issubclass(w.category, DeprecationWarning)]
        assert len(deprecations) == 1
        assert "POST /api/v3/old" in str(deprecations[0].message)

    def test_silent_without_header(self):
        client = self._client()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            client._warn_if_deprecated(self._response({}))
        assert [w for w in caught if issubclass(w.category, DeprecationWarning)] == []

    def test_warns_even_for_literal_true(self):
        client = self._client()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            client._warn_if_deprecated(self._response({"Deprecation": "true"}))
        assert (
            len([w for w in caught if issubclass(w.category, DeprecationWarning)]) == 1
        )

    def test_reads_sunset_and_link(self):
        client = self._client()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            client._warn_if_deprecated(
                self._response(
                    {
                        "Deprecation": "@1782345600",
                        "Sunset": "Fri, 25 Sep 2099 00:00:00 GMT",
                        "Link": '</api/v3/new>; rel="successor-version"',
                    }
                )
            )
        message = str(caught[0].message)
        assert "Fri, 25 Sep 2099 00:00:00 GMT" in message
        assert "Use /api/v3/new instead" in message

    def test_dedupes_across_path_params(self):
        client = self._client()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            for suffix in ("ca_1a2b3c", "ca_4d5e6f", "ca_7g8h9i"):
                client._warn_if_deprecated(
                    self._response(
                        {"Deprecation": "@1782345600"},
                        method="POST",
                        url=f"https://api.composio.dev/api/v3/connected_accounts/{suffix}",
                    )
                )
        deprecations = [w for w in caught if issubclass(w.category, DeprecationWarning)]
        assert len(deprecations) == 1

    def test_later_deprecated_flow_still_warns_after_silent_one(self):
        # An endpoint may only set the Deprecation header on certain flows
        # (e.g. SEC-339: managed-OAuth warns, custom-auth is silent). A prior
        # header-less response must NOT suppress a later deprecated one for the
        # same operation.
        client = self._client()
        url = "https://api.composio.dev/api/v3/connected_accounts"
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            client._warn_if_deprecated(self._response({}, method="POST", url=url))
            client._warn_if_deprecated(
                self._response({"Deprecation": "@1782345600"}, method="POST", url=url)
            )
        deprecations = [w for w in caught if issubclass(w.category, DeprecationWarning)]
        assert len(deprecations) == 1

    def test_respects_opt_out(self):
        seen = []
        client = self._client(
            disable_deprecation_warnings=True, on_deprecation=seen.append
        )
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            client._warn_if_deprecated(self._response({"Deprecation": "@1782345600"}))
        assert [w for w in caught if issubclass(w.category, DeprecationWarning)] == []
        assert seen == []

    def test_fires_on_deprecation_callback(self):
        seen = []
        client = self._client(on_deprecation=seen.append)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            client._warn_if_deprecated(
                self._response(
                    {
                        "Deprecation": "@1782345600",
                        "Sunset": "Fri, 25 Sep 2099 00:00:00 GMT",
                        "Link": '</api/v3/new>; rel="successor-version"',
                    },
                    method="POST",
                    url="https://api.composio.dev/api/v3/connected_accounts/ca_1a2b3c4d",
                )
            )
        assert len(seen) == 1
        info = seen[0]
        assert info["method"] == "POST"
        assert info["path"] == "/api/v3/connected_accounts/{param}"
        assert info["deprecated_at"] == datetime.datetime.fromtimestamp(
            1782345600, tz=datetime.timezone.utc
        )
        assert info["sunset"].year == 2099
        assert info["successor"] == "/api/v3/new"

    def test_never_throws_on_callback_error(self):
        def boom(_info):
            raise RuntimeError("callback boom")

        client = self._client(on_deprecation=boom)
        # Should not raise.
        with warnings.catch_warnings(record=True):
            warnings.simplefilter("always")
            client._warn_if_deprecated(self._response({"Deprecation": "@1782345600"}))

    def test_never_throws_on_garbage_header_values(self):
        # Realistic case: malformed header values must not raise, and presence
        # of Deprecation still warns (with no parsed date/sunset).
        client = self._client()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            client._warn_if_deprecated(
                self._response(
                    {
                        "Deprecation": "@@@garbage",
                        "Sunset": "not-a-date",
                        "Link": "<<<broken",
                    }
                )
            )
        deprecations = [w for w in caught if issubclass(w.category, DeprecationWarning)]
        assert len(deprecations) == 1

    def test_never_throws_on_broken_response(self):
        # Defensive: even a pathological response object must be swallowed.
        client = self._client()

        class BadHeaders:
            def __contains__(self, _key):
                raise ValueError("boom")

        class FakeResponse:
            headers = BadHeaders()

        try:
            client._warn_if_deprecated(FakeResponse())  # type: ignore[arg-type]
        except ValueError:
            pytest.fail("_warn_if_deprecated must not raise on garbage headers")
