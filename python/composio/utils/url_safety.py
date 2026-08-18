"""SSRF protections for user-supplied URL file inputs.

Guarding a user-supplied URL takes two steps, because the hostname is resolved
twice: once by this module when it validates the target, and once by the HTTP
client when it opens the connection.

``assert_safe_fetch_target`` covers the first resolution. It rejects non-HTTP(S)
URLs and any hostname whose DNS answers include a non-publicly-routable address,
which also defeats decimal/octal/hex IP obfuscation because the *resolved*
address is what gets checked.

``assert_safe_connected_peer`` covers the second. An attacker-controlled DNS
server with a short TTL can answer with a public address for the validating
lookup and an internal one for the connecting lookup -- a time-of-check /
time-of-use window better known as DNS rebinding. Re-checking the address the
socket actually landed on, before any response body is read, means an internal
service never returns data to the caller.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import requests
import requests.utils

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
    """Refuse non-HTTP(S) URLs and hosts that resolve to internal addresses.

    Parse the URL after Requests prepares it so validation uses the same
    canonical hostname that the eventual connection will use.
    """
    try:
        prepared_url = requests.Request(method="GET", url=url).prepare().url
        if prepared_url is None:
            raise ValueError("Prepared URL is missing")
        parsed = urlparse(prepared_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("URL must use HTTP(S) and include a hostname")
    except (requests.exceptions.RequestException, ValueError):
        raise BlockedInternalUrlError(
            "Refusing to fetch a malformed or non-http(s) URL"
        ) from None

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


def _request_used_environment_proxy(url: str) -> bool:
    """Whether Requests would route ``url`` through an environment proxy.

    ``requests.get`` honors ``HTTP_PROXY`` / ``HTTPS_PROXY`` / ``ALL_PROXY``
    (and the ``NO_PROXY`` exemptions) by default (``trust_env=True``). When a
    proxy is in play, the client socket is connected to the *proxy*, so its
    peer address says nothing about the target host. This mirrors the
    client's own selection logic so this module and the connection agree on
    whether a proxy sits in between.
    """
    try:
        proxies = requests.utils.get_environ_proxies(url)
        return requests.utils.select_proxy(url, proxies) is not None
    except Exception:  # noqa: BLE001 - platform proxy discovery can fail
        # If proxy discovery itself fails, whether the socket peer is the
        # target is unknowable; treat it like an undeterminable peer rather
        # than rejecting a legitimate fetch. assert_safe_fetch_target has
        # already validated the resolved addresses.
        return True


def _connected_peer_address(response: requests.Response) -> str | None:
    """Best-effort address of the socket a response is connected to.

    Returns ``None`` when there is no peer to inspect: the response may have
    been produced by a transport adapter that is not backed by a socket, or
    the connection may already have been released back to the pool.
    """
    raw = getattr(response, "raw", None)
    connection = getattr(raw, "connection", None)
    sock = getattr(connection, "sock", None)
    if sock is None:
        return None

    try:
        peer = sock.getpeername()
    except (AttributeError, OSError):
        return None

    if isinstance(peer, tuple) and peer and isinstance(peer[0], str):
        return peer[0]
    return None


def assert_safe_connected_peer(response: requests.Response, url: str) -> None:
    """Refuse a response whose connection landed on an internal address.

    ``assert_safe_fetch_target`` validates the addresses a hostname resolves
    to, but the HTTP client resolves that hostname again when it connects, so
    validation on its own leaves a DNS-rebinding window (see the module
    docstring). This closes the exploitable half of that window by checking the
    address the socket is genuinely connected to and dropping the response
    before a single body byte is read.

    Two situations are deliberately left alone rather than rejected:

    - The request went through an environment-configured proxy. The socket's
      peer is then the proxy -- commonly a loopback or RFC 1918 address that
      the operator chose on purpose -- and tells us nothing about the target,
      so treating it as a rebound host would break every fetch behind a
      corporate proxy. The proxy performs its own DNS resolution, which is
      outside this client's observable reach.
    - The peer cannot be determined at all (mocked transport, non-socket
      adapter, connection already released). There is nothing to check, and
      the pre-flight resolution check has already run.

    Call this while the response is still streaming, before reading the body.
    """
    if _request_used_environment_proxy(url):
        return

    peer = _connected_peer_address(response)
    if peer is None or not is_blocked_ip(peer):
        return

    response.close()
    hostname = urlparse(url).hostname or "the requested host"
    raise BlockedInternalUrlError(
        f'Refusing to read from "{hostname}" because the connection was '
        f"established to a non-public address ({peer}), even though the host "
        "resolved to a public address during validation. This is the "
        "signature of a DNS-rebinding attack."
    )
