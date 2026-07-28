"""Regression tests for URL file-upload SSRF protections."""

from __future__ import annotations

import socket
from unittest.mock import patch

import pytest

from composio.exceptions import BlockedInternalUrlError
from composio.utils.url_safety import assert_safe_fetch_target, is_blocked_ip


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
