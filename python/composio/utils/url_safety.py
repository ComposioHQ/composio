"""SSRF protections for URLs the SDK fetches.

Applies to URLs the caller supplies *and* to URLs an API response supplies:
under the trust boundary documented in ``python/AGENTS.md`` the backend may be
compromised or the connection MITM'd, so a presigned URL in a response is no
more trusted than one typed by a user. Without a guard, either can point the
SDK at loopback, RFC1918 space, or a link-local cloud-metadata endpoint
(``169.254.169.254``) and turn it into a request proxy for internal
infrastructure.

Known residual — DNS rebinding: the host is resolved here with
``getaddrinfo``, and the HTTP client resolves it again independently when it
connects. A short-TTL record that alternates a public and a private answer can
pass this check and still connect to the private address. Closing that window
requires pinning the validated address and connecting to it directly (a custom
``requests`` transport adapter), which is out of scope for this module; the
TypeScript guard carries the same limitation.

Also parses response headers that gate how much of a body the SDK reads:
``parse_content_length`` treats ``Content-Length`` as the untrusted hint it
is, so a malformed value degrades to an unknown size under a streamed byte
count instead of crashing the fetch.
"""

from __future__ import annotations

import ipaddress
import socket
import typing as t
from urllib.parse import urljoin, urlparse

import requests

from composio.exceptions import BlockedInternalUrlError

_REDIRECT_STATUS_CODES = frozenset({301, 302, 303, 307, 308})
_MAX_REDIRECTS = 5


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


def parse_content_length(value: t.Optional[str]) -> t.Optional[int]:
    """Parse a ``Content-Length`` header into a non-negative ``int``.

    ``Content-Length`` is supplied by the remote server and is therefore
    untrusted: it may be absent, non-numeric (``"abc"``), fractional
    (``"12.5"``), thousands-separated (``"1,024"``) or negative. Anything
    untrustworthy returns ``None`` so the caller treats the size as unknown
    and falls through to a streamed byte count, which stays authoritative
    because the header can also be absent or understated. Mirrors
    ``readResponseBodyWithLimit`` in the TypeScript SDK, which only trusts
    values matching ``/^\\d+$/``.
    """
    if value is None:
        return None
    try:
        size = int(value.strip())
    except ValueError:
        return None
    return size if size >= 0 else None


def safe_request(
    method: str,
    url: str,
    *,
    max_redirects: int = _MAX_REDIRECTS,
    **kwargs: t.Any,
) -> requests.Response:
    """Send a request, validating the target before *every* hop.

    Redirects are followed manually so each new location is validated too.
    Validating only the first URL is not enough: a target that passes the check
    and then answers ``302 Location: http://169.254.169.254/`` would have the
    redirect followed by ``requests`` with no further validation. Mirrors
    ``ssrfSafeFetch`` in the TypeScript SDK.

    Use this where redirects are legitimate (S3 can answer a PUT with a 307
    region redirect). Call sites that require a direct URL should instead call
    :func:`assert_safe_fetch_target` and pass ``allow_redirects=False``.

    :param max_redirects: Hops to follow before giving up.
    :raises BlockedInternalUrlError: If any hop fails validation, or the
        redirect chain is longer than ``max_redirects``.
    """
    body = kwargs.get("data")
    current_url = url

    for _ in range(max_redirects + 1):
        assert_safe_fetch_target(current_url)
        response = requests.request(
            method, current_url, allow_redirects=False, **kwargs
        )

        location = response.headers.get("Location")
        if response.status_code not in _REDIRECT_STATUS_CODES or location is None:
            return response

        response.close()
        current_url = urljoin(current_url, location)

        # `requests` rewinds the body itself when it follows a redirect; doing
        # it manually means doing that too, or a retried upload sends nothing.
        seek = getattr(body, "seek", None)
        if callable(seek):
            seek(0)

    raise BlockedInternalUrlError(
        f"Refusing to fetch: too many redirects (max {max_redirects})"
    )
