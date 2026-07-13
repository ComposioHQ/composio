"""SSRF protection for user-supplied URL file inputs."""

from __future__ import annotations

import ipaddress
import socket
import typing as t
from urllib.parse import urlparse

import requests

from composio.exceptions import ComposioBlockedInternalUrlError

_IPV4_BLOCKED_NETWORKS = tuple(
    t.cast(ipaddress.IPv4Network, ipaddress.ip_network(cidr))
    for cidr in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "224.0.0.0/4",
        "240.0.0.0/4",
    )
)
_IPV4_COMPATIBLE_NETWORK = ipaddress.IPv6Network("::/96")
_NAT64_NETWORK = ipaddress.IPv6Network("64:ff9b::/96")


def _is_blocked_ipv4(address: ipaddress.IPv4Address) -> bool:
    """Return whether an IPv4 address must not be fetched."""
    return (
        not address.is_global
        or address.is_multicast
        or any(address in network for network in _IPV4_BLOCKED_NETWORKS)
    )


def _embedded_ipv4_address(
    address: ipaddress.IPv6Address,
) -> t.Optional[ipaddress.IPv4Address]:
    """Extract IPv4 addresses embedded in mapped, compatible, or NAT64 forms."""
    if address.ipv4_mapped is not None:
        return address.ipv4_mapped
    if address in _IPV4_COMPATIBLE_NETWORK or address in _NAT64_NETWORK:
        return ipaddress.IPv4Address(int(address) & 0xFFFFFFFF)
    return None


def is_blocked_ip(ip: str) -> bool:
    """Return whether an IP address is not publicly routable.

    Invalid address strings fail closed. IPv4 addresses embedded in IPv6 are
    checked against the IPv4 blocklist so mapped, compatible, and NAT64 forms
    cannot bypass the guard.
    """
    try:
        address = ipaddress.ip_address(ip.split("%", 1)[0])
    except ValueError:
        return True

    if isinstance(address, ipaddress.IPv4Address):
        return _is_blocked_ipv4(address)

    embedded = _embedded_ipv4_address(address)
    if embedded is not None:
        return _is_blocked_ipv4(embedded)

    return not address.is_global or address.is_multicast


def assert_safe_fetch_target(raw_url: str) -> None:
    """Validate that an HTTP(S) URL resolves only to public addresses.

    The resolved address is checked instead of only checking the hostname, so
    encoded IP literals and hostnames resolving to internal infrastructure are
    blocked. Every resolved address must be public to prevent a hostname from
    mixing public and internal DNS results.

    Note: DNS can change between this validation and ``requests`` connecting.
    Fully closing that DNS-rebinding window requires connect-time IP pinning.

    :raises ComposioBlockedInternalUrlError: if the URL is malformed, cannot be
        resolved, or resolves to a non-public address.
    """
    try:
        prepared_url = requests.Request(method="GET", url=raw_url).prepare().url
        if prepared_url is None:
            raise ValueError
        parsed = urlparse(prepared_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except (requests.exceptions.RequestException, UnicodeError, ValueError):
        raise ComposioBlockedInternalUrlError(
            "Refusing to fetch a malformed or non-http(s) URL"
        ) from None

    host = parsed.hostname
    try:
        resolved = socket.getaddrinfo(
            host,
            port,
            type=socket.SOCK_STREAM,
        )
    except OSError:
        raise ComposioBlockedInternalUrlError(
            f'Could not resolve URL host "{host}"'
        ) from None

    if not resolved:
        raise ComposioBlockedInternalUrlError(f'Could not resolve URL host "{host}"')

    for _, _, _, _, socket_address in resolved:
        address = t.cast(str, socket_address[0])
        if is_blocked_ip(address):
            raise ComposioBlockedInternalUrlError(
                f'Refusing to fetch "{host}" because it resolves to a non-public address'
            )
