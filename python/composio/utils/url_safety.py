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

    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        return is_blocked_ip(str(address.ipv4_mapped))
    return not address.is_global


def assert_safe_fetch_target(url: str) -> None:
    """Refuse non-HTTP(S) URLs and hosts that resolve to internal addresses."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise BlockedInternalUrlError("Refusing to fetch a non-http(s) URL")

    try:
        addresses = {
            result[4][0] for result in socket.getaddrinfo(parsed.hostname, None)
        }
    except socket.gaierror as error:
        raise BlockedInternalUrlError(
            f'Could not resolve host "{parsed.hostname}"'
        ) from error

    for address in addresses:
        if is_blocked_ip(address):
            raise BlockedInternalUrlError(
                f'Refusing to fetch "{parsed.hostname}" because it resolves to a non-public address'
            )
