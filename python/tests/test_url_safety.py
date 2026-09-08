"""Regression tests for URL file-upload SSRF protections."""

from __future__ import annotations

import io
import socket
from unittest.mock import MagicMock, call, patch

import pytest

from composio.exceptions import BlockedInternalUrlError
from composio.utils.url_safety import (
    assert_safe_fetch_target,
    is_blocked_ip,
    safe_request,
)


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.5",
        "169.254.169.254",
        "100.64.0.1",
        "::1",
        "fc00::1",
        "::ffff:127.0.0.1",
        "::127.0.0.1",
        "::7f00:1",
        "::169.254.169.254",
        "64:ff9b::7f00:1",
        "64:ff9b::a9fe:a9fe",
        # Ranges the TypeScript guard's CIDR list blocks, so this one does too.
        "224.0.0.1",
        "233.252.0.1",
        "192.88.99.1",
        "ff02::1",
        "fec0::1",
        # Blocked here already; asserted so the two lists stay comparable.
        "2001::7f00:1",
        "2002:7f00:1::",
        "2002:c0a8:1::",
        "64:ff9b:1::7f00:1",
        "100::1",
        "2001:db8::1",
    ],
)
def test_blocks_non_public_addresses(address: str) -> None:
    assert is_blocked_ip(address) is True


@pytest.mark.parametrize(
    "address",
    [
        "8.8.8.8",
        "93.184.216.34",
        "2606:4700:4700::1111",
        "::8.8.8.8",
        "64:ff9b::8.8.8.8",
        # Neighbours of the blocked ranges above, so neither list overreaches.
        "2001:4860:4860::8888",
        "2a00:1450:4001:80f::200e",
        "223.255.255.255",
        "192.88.100.1",
    ],
)
def test_allows_public_addresses(address: str) -> None:
    assert is_blocked_ip(address) is False


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/file",
        "not a url",
        "http://example.com:invalid/file",
    ],
)
def test_rejects_malformed_or_non_http_urls(url: str) -> None:
    with pytest.raises(BlockedInternalUrlError):
        assert_safe_fetch_target(url)


@patch("composio.utils.url_safety.socket.getaddrinfo")
def test_validates_requests_canonicalized_hostname(mock_getaddrinfo) -> None:
    def resolve(host: str, _port: int | None):
        address = "127.0.0.1" if host == "127.0.0.1" else "93.184.216.34"
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 0)),
        ]

    mock_getaddrinfo.side_effect = resolve

    with pytest.raises(BlockedInternalUrlError):
        assert_safe_fetch_target(r"http://127.0.0.1\@example.com/file.pdf")

    mock_getaddrinfo.assert_called_once_with("127.0.0.1", None)


@patch("composio.utils.url_safety.socket.getaddrinfo")
def test_rejects_internal_dns_answers(mock_getaddrinfo) -> None:
    mock_getaddrinfo.return_value = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0)),
    ]

    with pytest.raises(BlockedInternalUrlError):
        assert_safe_fetch_target("https://example.com/file.pdf")


@patch("composio.utils.url_safety.socket.getaddrinfo")
def test_allows_public_dns_answers(mock_getaddrinfo) -> None:
    mock_getaddrinfo.return_value = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),
    ]

    assert_safe_fetch_target("https://example.com/file.pdf")


def _response(status_code: int, location: str | None = None) -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    response.headers = {"Location": location} if location else {}
    response.close = MagicMock()
    return response


@patch("composio.utils.url_safety.requests.Session.request")
@patch("composio.utils.url_safety.assert_safe_fetch_target")
def test_safe_request_validates_before_sending(mock_assert, mock_request) -> None:
    mock_assert.side_effect = BlockedInternalUrlError("blocked")

    with pytest.raises(BlockedInternalUrlError):
        safe_request("PUT", "https://s3.example.com/upload", data=b"payload")

    # The point of the guard: a rejected target must never reach the network.
    mock_request.assert_not_called()


@patch("composio.utils.url_safety.requests.Session.request")
@patch("composio.utils.url_safety.assert_safe_fetch_target")
def test_safe_request_disables_automatic_redirects(mock_assert, mock_request) -> None:
    mock_request.return_value = _response(200)

    response = safe_request("PUT", "https://s3.example.com/upload", data=b"payload")

    assert response.status_code == 200
    mock_assert.assert_called_once_with("https://s3.example.com/upload")
    # `requests` must not follow redirects on its own, or hops after the first
    # would be fetched without ever being validated.
    assert mock_request.call_args.kwargs["allow_redirects"] is False


@patch("composio.utils.url_safety.requests.Session.request")
@patch("composio.utils.url_safety.assert_safe_fetch_target")
def test_safe_request_revalidates_each_redirect_hop(mock_assert, mock_request) -> None:
    """A public URL that redirects into private space must be caught at the hop."""
    mock_assert.side_effect = [["93.184.216.34"], BlockedInternalUrlError("blocked")]
    mock_request.return_value = _response(
        307, "http://169.254.169.254/latest/meta-data"
    )

    with pytest.raises(BlockedInternalUrlError):
        safe_request("PUT", "https://s3.example.com/upload", data=b"payload")

    assert mock_assert.call_args_list == [
        call("https://s3.example.com/upload"),
        call("http://169.254.169.254/latest/meta-data"),
    ]
    # Only the first hop was sent; the redirect target never was.
    assert mock_request.call_count == 1


@patch("composio.utils.url_safety.requests.Session.request")
@patch("composio.utils.url_safety.assert_safe_fetch_target")
def test_safe_request_follows_validated_redirect(mock_assert, mock_request) -> None:
    """S3 can answer a PUT with a 307 region redirect; that must still work."""
    mock_request.side_effect = [
        _response(307, "https://s3.eu-west-1.example.com/upload"),
        _response(200),
    ]
    body = io.BytesIO(b"payload")

    response = safe_request("PUT", "https://s3.example.com/upload", data=body)

    assert response.status_code == 200
    assert mock_assert.call_args_list == [
        call("https://s3.example.com/upload"),
        call("https://s3.eu-west-1.example.com/upload"),
    ]
    # The body was rewound, so the retried hop sends the payload rather than
    # an already-exhausted stream.
    assert body.read() == b"payload"


# What the hop after a redirect is expected to carry: either the original body
# and the headers describing it, or neither.
_REPLAYED = {
    "data": b"payload",
    "headers": {"Content-Type": "application/octet-stream", "X-Test": "kept"},
}
_BODILESS = {"headers": {"X-Test": "kept"}}


@pytest.mark.parametrize(
    ("status_code", "method", "expected_method", "expected_kwargs"),
    [
        (301, "POST", "GET", _BODILESS),
        (301, "PUT", "PUT", _REPLAYED),
        (302, "POST", "GET", _BODILESS),
        (302, "PUT", "PUT", _REPLAYED),
        (303, "POST", "GET", _BODILESS),
        (303, "PUT", "GET", _BODILESS),
        (303, "HEAD", "HEAD", _BODILESS),
        (307, "POST", "POST", _REPLAYED),
        (308, "PUT", "PUT", _REPLAYED),
    ],
)
@patch("composio.utils.url_safety.requests.Session.request")
@patch("composio.utils.url_safety.assert_safe_fetch_target")
def test_safe_request_applies_fetch_redirect_semantics(
    mock_assert,
    mock_request,
    status_code: int,
    method: str,
    expected_method: str,
    expected_kwargs: dict,
) -> None:
    """The same rules `ssrfSafeFetch` gets from `fetch` in the TypeScript SDK.

    A 303 sends every method to a bodiless result request, 301/302 do that to a
    POST only, and 307/308 replay the original method and body.
    """
    mock_request.side_effect = [
        _response(status_code, "https://example.com/result"),
        _response(200),
    ]

    safe_request(method, "https://example.com/create", **_REPLAYED)

    assert mock_request.call_args_list[1] == call(
        expected_method,
        "https://example.com/result",
        allow_redirects=False,
        **expected_kwargs,
    )
    assert mock_assert.call_args_list[1] == call("https://example.com/result")


@patch("composio.utils.url_safety.requests.Session.request")
@patch("composio.utils.url_safety.assert_safe_fetch_target")
def test_safe_request_keeps_the_downgrade_across_later_hops(
    mock_assert, mock_request
) -> None:
    """A hop after the 303 must not resurrect the method or the body."""
    mock_request.side_effect = [
        _response(303, "https://example.com/result"),
        _response(307, "https://example.com/final"),
        _response(200),
    ]

    safe_request("POST", "https://example.com/create", **_REPLAYED)

    assert mock_request.call_args_list[2] == call(
        "GET",
        "https://example.com/final",
        allow_redirects=False,
        **_BODILESS,
    )


@patch("composio.utils.url_safety.requests.Session.request")
@patch("composio.utils.url_safety.assert_safe_fetch_target")
def test_safe_request_does_not_reapply_params_to_the_redirect_target(
    mock_assert, mock_request
) -> None:
    """`Location` carries its own query; re-appending would leak the original."""
    mock_request.side_effect = [
        _response(307, "https://other.example.com/elsewhere"),
        _response(200),
    ]

    safe_request("GET", "https://example.com/download", params={"token": "secret"})

    assert mock_request.call_args_list[1] == call(
        "GET",
        "https://other.example.com/elsewhere",
        allow_redirects=False,
    )


@patch("composio.utils.url_safety.requests.Session.request")
@patch("composio.utils.url_safety.assert_safe_fetch_target")
def test_safe_request_relative_redirect_is_resolved(mock_assert, mock_request) -> None:
    mock_request.side_effect = [_response(302, "/elsewhere"), _response(200)]

    safe_request("GET", "https://files.example.com/a/b")

    assert mock_assert.call_args_list[1] == call("https://files.example.com/elsewhere")


@patch("composio.utils.url_safety.requests.Session.request")
@patch("composio.utils.url_safety.assert_safe_fetch_target")
def test_safe_request_rejects_endless_redirects(mock_assert, mock_request) -> None:
    mock_request.return_value = _response(302, "https://s3.example.com/upload")

    with pytest.raises(BlockedInternalUrlError, match="too many redirects"):
        safe_request("GET", "https://s3.example.com/upload", max_redirects=2)

    assert mock_request.call_count == 3
