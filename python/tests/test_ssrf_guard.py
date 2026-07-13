"""Tests for SSRF protection on URL file inputs."""

import socket
from unittest.mock import patch

import pytest

from composio.exceptions import ComposioBlockedInternalUrlError
from composio.utils.ssrf_guard import assert_safe_fetch_target, is_blocked_ip


def _resolved_address(address: str):
    """Return a getaddrinfo-compatible result for one address."""
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    socket_address = (
        (address, 443, 0, 0) if family == socket.AF_INET6 else (address, 443)
    )
    return [(family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", socket_address)]


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.1",
        "100.64.0.1",
        "169.254.169.254",
        "172.16.0.1",
        "192.168.0.1",
        "198.18.0.1",
        "224.0.0.1",
        "::",
        "::1",
        "fc00::1",
        "fe80::1",
        "ff00::1",
        "::ffff:127.0.0.1",
        "::127.0.0.1",
        "64:ff9b::127.0.0.1",
    ],
)
def test_is_blocked_ip_rejects_non_public_addresses(address):
    """Private, special-use, and embedded internal addresses are blocked."""
    assert is_blocked_ip(address) is True


@pytest.mark.parametrize(
    "address",
    [
        "1.1.1.1",
        "8.8.8.8",
        "93.184.216.34",
        "2606:4700:4700::1111",
        "::ffff:8.8.8.8",
        "::8.8.8.8",
        "64:ff9b::8.8.8.8",
    ],
)
def test_is_blocked_ip_allows_public_addresses(address):
    """Public IPv4, IPv6, and embedded IPv4 addresses remain allowed."""
    assert is_blocked_ip(address) is False


def test_is_blocked_ip_fails_closed_for_invalid_input():
    """Invalid address strings are treated as blocked."""
    assert is_blocked_ip("not-an-ip") is True


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/file.txt",
        "not-a-url",
        "http://example.com:invalid/file.txt",
    ],
)
def test_assert_safe_fetch_target_rejects_malformed_or_unsupported_urls(url):
    """Only well-formed HTTP(S) URLs are accepted."""
    with pytest.raises(ComposioBlockedInternalUrlError):
        assert_safe_fetch_target(url)


def test_assert_safe_fetch_target_rejects_internal_dns_result():
    """A hostname resolving to an internal address is blocked."""
    with patch(
        "composio.utils.ssrf_guard.socket.getaddrinfo",
        return_value=_resolved_address("169.254.169.254"),
    ):
        with pytest.raises(ComposioBlockedInternalUrlError):
            assert_safe_fetch_target("http://metadata.internal/latest")


def test_assert_safe_fetch_target_rejects_any_internal_dns_result():
    """Mixed public and private DNS answers fail closed."""
    resolved = _resolved_address("93.184.216.34") + _resolved_address("127.0.0.1")
    with patch(
        "composio.utils.ssrf_guard.socket.getaddrinfo",
        return_value=resolved,
    ):
        with pytest.raises(ComposioBlockedInternalUrlError):
            assert_safe_fetch_target("https://example.com/file.txt")


def test_assert_safe_fetch_target_uses_requests_interpreted_hostname():
    """Backslashes cannot create a parser mismatch that bypasses the guard."""
    with patch(
        "composio.utils.ssrf_guard.socket.getaddrinfo",
        return_value=_resolved_address("127.0.0.1"),
    ) as mock_getaddrinfo:
        with pytest.raises(ComposioBlockedInternalUrlError):
            assert_safe_fetch_target(r"http://127.0.0.1\@example.com/file.txt")

    mock_getaddrinfo.assert_called_once_with(
        "127.0.0.1",
        80,
        type=socket.SOCK_STREAM,
    )


def test_assert_safe_fetch_target_allows_public_dns_results():
    """A hostname resolving only to public addresses is accepted."""
    resolved = _resolved_address("93.184.216.34") + _resolved_address(
        "2606:4700:4700::1111"
    )
    with patch(
        "composio.utils.ssrf_guard.socket.getaddrinfo",
        return_value=resolved,
    ) as mock_getaddrinfo:
        assert_safe_fetch_target("https://example.com/file.txt")

    mock_getaddrinfo.assert_called_once_with(
        "example.com",
        443,
        type=socket.SOCK_STREAM,
    )


def test_assert_safe_fetch_target_rejects_unresolvable_host():
    """DNS resolution failures are exposed as blocked URL errors."""
    with patch(
        "composio.utils.ssrf_guard.socket.getaddrinfo",
        side_effect=socket.gaierror,
    ):
        with pytest.raises(ComposioBlockedInternalUrlError):
            assert_safe_fetch_target("https://missing.example/file.txt")
