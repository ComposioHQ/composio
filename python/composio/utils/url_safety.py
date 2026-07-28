"""SSRF protections for user-supplied URL file inputs."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from composio.exceptions import BlockedInternalUrlError


def is_blocked_ip(value: str) -> bool:
    """Return whether an address is non-publicly-routable."""
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return True

    if isinstance(address, ipaddress.IPv6Address):
        embedded_ipv4 = address.ipv4_mapped
        if embedded_ipv4 is None and address.packed[:12] in {
            b"\x00" * 12,
            b"\x00d\xff\x9b" + b"\x00" * 8,
        }:
            embedded_ipv4 = ipaddress.IPv4Address(address.packed[-4:])
        if embedded_ipv4 is not None:
            return is_blocked_ip(str(embedded_ipv4))

    return not address.is_global


def assert_safe_fetch_target(url: str) -> None:
    """Refuse non-HTTP(S) URLs and hosts that resolve to internal addresses."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise BlockedInternalUrlError("Refusing to fetch a non-http(s) URL")

    try:
        addresses: set[str] = set()
        for result in socket.getaddrinfo(parsed.hostname, None):
            address = result[4][0]
            if not isinstance(address, str):
                raise BlockedInternalUrlError(
                    f'Could not resolve host "{parsed.hostname}"'
                )
            addresses.add(address)
    except socket.gaierror as error:
        raise BlockedInternalUrlError(
            f'Could not resolve host "{parsed.hostname}"'
        ) from error

    for address in addresses:
        if is_blocked_ip(address):
            raise BlockedInternalUrlError(
                f'Refusing to fetch "{parsed.hostname}" because it resolves to a non-public address'
            )
