"""SSRF protections for URLs the SDK fetches.

Applies to URLs the caller supplies *and* to URLs an API response supplies:
under the trust boundary documented in ``python/AGENTS.md`` the backend may be
compromised or the connection MITM'd, so a presigned URL in a response is no
more trusted than one typed by a user. Without a guard, either can point the
SDK at loopback, RFC1918 space, or a link-local cloud-metadata endpoint
(``169.254.169.254``) and turn it into a request proxy for internal
infrastructure.

Validating a hostname is not enough on its own, because the hostname is
resolved twice: once here, and once by the HTTP client when it opens the
socket. A short-TTL record can answer with a public address for the first
lookup and an internal one for the second — a time-of-check/time-of-use
window better known as DNS rebinding. So the address validated here is also
the address connected to: :func:`safe_get` and :func:`safe_request` pin it
onto the connection, keeping the original hostname for the ``Host`` header
and TLS SNI/certificate verification. Every fetch in the SDK goes through one
of those two, so no call site can reintroduce the gap by calling
``requests.get`` next to a bare check. The TypeScript guard pins the same way.

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
import urllib3.exceptions

from composio.exceptions import BlockedInternalUrlError

# urllib3 rewraps connect failures into its own hierarchy, none of which
# inherits from OSError, so a bare `except OSError` would never see them and
# the address fallback below would never run.
_CONNECT_ERRORS = (
    OSError,
    urllib3.exceptions.NewConnectionError,
    urllib3.exceptions.ConnectTimeoutError,
    urllib3.exceptions.NameResolutionError,
)

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


def assert_safe_fetch_target(url: str) -> t.List[str]:
    """Refuse non-HTTP(S) URLs and hosts that resolve to internal addresses.

    Parse the URL after Requests prepares it so validation uses the same
    canonical hostname that the eventual connection will use.

    :returns: The validated addresses to connect to, in resolver order.
        Callers must connect to *these* rather than re-resolving the hostname;
        see :func:`safe_get`.
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
        # Resolver order is kept: it encodes the system's address preference
        # (RFC 6724), and connecting walks it the way urllib3 would.
        addresses: t.List[str] = []
        for result in socket.getaddrinfo(parsed.hostname, None):
            address = result[4][0]
            if not isinstance(address, str):
                raise BlockedInternalUrlError(
                    f'Could not resolve host "{parsed.hostname}"'
                )
            if address not in addresses:
                addresses.append(address)
    except socket.gaierror as error:
        raise BlockedInternalUrlError(
            f'Could not resolve host "{parsed.hostname}"'
        ) from error

    for address in addresses:
        if is_blocked_ip(address):
            raise BlockedInternalUrlError(
                f'Refusing to fetch "{parsed.hostname}" because it resolves to a non-public address'
            )

    if not addresses:
        raise BlockedInternalUrlError(f'Could not resolve host "{parsed.hostname}"')

    return addresses


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

    Redirects are followed manually so each new location is validated — and
    pinned — too. Validating only the first URL is not enough: a target that
    passes the check and then answers ``302 Location: http://169.254.169.254/``
    would have the redirect followed by ``requests`` with no further
    validation. Mirrors ``ssrfSafeFetch`` in the TypeScript SDK.

    Use this where redirects are legitimate (S3 can answer a PUT with a 307
    region redirect). Call sites that require a direct URL should use
    :func:`safe_get`, which rejects nothing but simply does not follow them.

    :param max_redirects: Hops to follow before giving up.
    :raises BlockedInternalUrlError: If any hop fails validation, or the
        redirect chain is longer than ``max_redirects``.
    """
    body = kwargs.get("data")
    current_url = url

    for _ in range(max_redirects + 1):
        response = _pinned_request(method, current_url, **kwargs)

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


class _PinnedAddressAdapter(requests.adapters.HTTPAdapter):
    """Transport adapter that connects to a pre-validated address.

    The hostname is left untouched on the connection, so the ``Host`` header
    and the TLS SNI/certificate check still use it; only the address the
    socket dials is replaced. Doing it the other way round — rewriting
    ``conn._dns_host`` for the whole connection — would also rewrite
    ``conn.host``, which urllib3 derives from it, and the request would go out
    with an IP in ``Host`` and an IP in SNI, failing certificate verification
    against every real origin.

    This reaches into two urllib3 internals, ``HTTPConnection._new_conn`` and
    ``HTTPConnection._dns_host``. ``test_url_safety_pinning.py`` asserts both
    exist so a urllib3 upgrade that removes them fails loudly rather than
    silently un-pinning the connection.
    """

    def __init__(self, addresses: t.Sequence[str], **kwargs: t.Any) -> None:
        self._addresses = list(addresses)
        super().__init__(**kwargs)

    def get_connection_with_tls_context(
        self,
        request: requests.PreparedRequest,
        verify: t.Union[bool, str, None],
        proxies: t.Optional[t.Mapping[str, str]] = None,
        cert: t.Union[str, t.Tuple[str, str], None] = None,
    ) -> t.Any:
        # `Any`, because the pinning below reaches for urllib3 internals that
        # the typed `ConnectionPool` surface does not expose.
        pool: t.Any = super().get_connection_with_tls_context(
            request, verify, proxies=proxies, cert=cert
        )
        addresses = self._addresses
        build_connection = pool._new_conn

        def _new_conn() -> t.Any:
            connection = build_connection()
            open_socket = connection._new_conn

            def _pinned_new_conn() -> t.Any:
                # Swap the resolution target for the duration of the socket
                # connect only. urllib3 reads `self.host` for SNI *after*
                # `_new_conn()` returns, and `http.client` reads it later
                # still for the `Host` header, so both see the hostname.
                #
                # Every validated address is tried in resolver order, the way
                # urllib3 would have: pinning one address of a dual-stack host
                # would strand callers whose network cannot reach that family.
                hostname = connection._dns_host
                last_error: t.Optional[BaseException] = None
                for address in addresses:
                    connection._dns_host = address
                    try:
                        sock = open_socket()
                    except _CONNECT_ERRORS as error:
                        last_error = error
                        continue
                    finally:
                        connection._dns_host = hostname
                    _assert_pinned_peer(sock, address, hostname)
                    return sock

                assert last_error is not None
                raise last_error

            connection._new_conn = _pinned_new_conn
            return connection

        pool._new_conn = _new_conn
        return pool


def _assert_pinned_peer(sock: t.Any, address: str, hostname: str) -> None:
    """Fail closed if the open socket is not connected to the pinned address.

    A redundancy check on the pinning above, run before a single byte is
    written to the socket — a post-response check would be too late and
    unreliable, because urllib3 detaches the socket as soon as the server
    signals ``Connection: close``, while the body stays readable.
    """
    try:
        peer = sock.getpeername()[0]
    except (AttributeError, OSError, IndexError):
        return

    try:
        connected_to_pinned = ipaddress.ip_address(peer) == ipaddress.ip_address(
            address
        )
    except ValueError:
        connected_to_pinned = peer == address

    if connected_to_pinned:
        return

    sock.close()
    raise BlockedInternalUrlError(
        f'Refusing to talk to "{hostname}": the connection was established to '
        f"{peer}, not to the validated address {address}"
    )


def _proxy_applies(url: str, proxies: t.Optional[t.Mapping[str, str]]) -> bool:
    """Whether Requests would send ``url`` through a proxy.

    Requests honours ``HTTP_PROXY``/``HTTPS_PROXY``/``ALL_PROXY`` (minus
    ``NO_PROXY``) by default. Through a proxy the socket is dialled to the
    *proxy*, so pinning the target address would connect to the wrong host
    entirely.

    Residual: proxied requests keep only the pre-flight check, because the
    proxy resolves the hostname itself and the SDK cannot see or pin that
    resolution. A rebinding window therefore remains for callers that run
    behind a proxy — including one inherited from the environment.
    """
    try:
        environment_proxies = requests.utils.get_environ_proxies(url)
        merged = {**environment_proxies, **(proxies or {})}
        return requests.utils.select_proxy(url, merged) is not None
    except Exception:  # pragma: no cover - platform proxy discovery can fail
        # Unknowable, so assume a proxy rather than pinning onto a connection
        # that may not go where we think it goes.
        return True


def safe_get(url: str, **kwargs: t.Any) -> requests.Response:
    """Validate a URL and fetch it without re-resolving its hostname.

    Redirects are never followed: call sites that need a direct URL treat a
    3xx as an error, and call sites where redirects are legitimate use
    :func:`safe_request`.
    """
    return _pinned_request("GET", url, **kwargs)


def _pinned_request(method: str, url: str, **kwargs: t.Any) -> requests.Response:
    addresses = assert_safe_fetch_target(url)

    session = requests.Session()
    if not _proxy_applies(url, kwargs.get("proxies")):
        # A fresh Session per request, so a connection pinned to one address is
        # never reused for a request validated against another.
        adapter = _PinnedAddressAdapter(addresses)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

    response = session.request(method, url, allow_redirects=False, **kwargs)
    # The response may still be streaming, and closing the session would close
    # the pool holding its connection, so tie the session's lifetime to it.
    response._composio_session = session  # type: ignore[attr-defined]
    return response
