"""Regression tests for the DNS-rebinding window in the SSRF guard.

The guard resolves a hostname to decide whether a URL is safe. If the HTTP
client then resolves that hostname a *second* time to open the socket, an
attacker who controls the authoritative DNS can answer with a public address
for the check and an internal one for the connect — the check and the use are
about different addresses (issue #4151).

These tests run against real sockets on loopback rather than mocking the HTTP
client, because a mocked client cannot resolve anything twice and so cannot
express the bug at all. The resolver is the only thing faked: it answers the
first lookup of the hostname with one endpoint and every later lookup with
another, which is exactly what a short-TTL rebinding record does.
"""

from __future__ import annotations

import ipaddress
import os
import socket
import threading
import typing as t
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import MagicMock, patch

import pytest
import requests
import urllib3.connection

from composio.exceptions import BlockedInternalUrlError
from composio.utils.url_safety import _assert_pinned_peer, safe_get

HOSTNAME = "rebind.test"


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


class _RecordingServer:
    """A loopback HTTP server that records what actually reached it."""

    def __init__(self, body: bytes) -> None:
        self.hits: t.List[str] = []
        recorder = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_GET(self) -> None:  # noqa: N802 - stdlib naming
                recorder.hits.append(self.headers.get("Host", ""))
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args: t.Any) -> None:
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        # Keep-alive connections would otherwise hold `shutdown()` open.
        self._server.daemon_threads = True
        self.port = self._server.server_address[1]
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()


@pytest.fixture
def validated_server() -> t.Iterator[_RecordingServer]:
    server = _RecordingServer(b"public payload")
    yield server
    server.close()


@pytest.fixture
def rebound_server() -> t.Iterator[_RecordingServer]:
    server = _RecordingServer(b"internal secret")
    yield server
    server.close()


@pytest.fixture
def no_inherited_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make ``_proxy_applies`` deterministic: no proxy, from env or system.

    An inherited ``HTTP_PROXY`` (or a macOS/Windows system proxy, which
    ``getproxies`` also reads) would disable the pinning adapter, and the
    request would dial the proxy's answer to the hostname instead of the
    validated address — failing these tests on machines that carry one.
    """
    monkeypatch.setattr(
        "requests.utils.get_environ_proxies",
        lambda url: {},
    )


@pytest.fixture
def rebinding_dns(
    no_inherited_proxy: None,
    validated_server: _RecordingServer,
    rebound_server: _RecordingServer,
) -> t.Iterator[None]:
    """Answer the first lookup of the hostname benignly, later ones with the victim.

    Both endpoints live on 127.0.0.1 because a test cannot bind a public
    address, so they are told apart by port; `is_blocked_ip` is stubbed out for
    the same reason. Neither substitution touches the property under test,
    which is whether the fetch connects to the endpoint that was validated or
    re-resolves and connects somewhere else. The blocklist itself is covered by
    ``test_url_safety.py``.
    """
    lookups: t.List[str] = []
    real_getaddrinfo = socket.getaddrinfo

    def fake_getaddrinfo(host, port, *args, **kwargs):  # type: ignore[no-untyped-def]
        # A real resolver hands an IP literal straight back, which is what the
        # fix relies on when it connects to the address it already validated.
        if _is_ip_literal(host):
            return real_getaddrinfo(host, port, *args, **kwargs)

        lookups.append(host)
        victim = rebound_server if len(lookups) > 1 else validated_server
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", victim.port))]

    with patch("socket.getaddrinfo", side_effect=fake_getaddrinfo):
        with patch("composio.utils.url_safety.is_blocked_ip", return_value=False):
            yield


def test_proxy_environment_keeps_only_the_pre_flight_check(
    validated_server: _RecordingServer,
) -> None:
    """Behind a proxy the SDK cannot pin: the proxy resolves the hostname.

    Documented residual — ``_proxy_applies`` disables the pinning adapter, so
    the request dials the proxy. A proxy nothing can reach makes that
    observable: the request must fail by trying the proxy, never by dialling
    the validated address. (This test deliberately does not use
    ``no_inherited_proxy`` — it needs ``HTTP_PROXY`` visible — so it patches
    the resolver inline instead.)
    """
    real_getaddrinfo = socket.getaddrinfo

    def fake_getaddrinfo(host, port, *args, **kwargs):  # type: ignore[no-untyped-def]
        if _is_ip_literal(host):
            return real_getaddrinfo(host, port, *args, **kwargs)
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                ("127.0.0.1", validated_server.port),
            )
        ]

    # Empty NO_PROXY so no machine-level bypass list can cover the hostname.
    env = {"HTTP_PROXY": "http://127.0.0.1:9", "NO_PROXY": "", "no_proxy": ""}
    with patch("socket.getaddrinfo", side_effect=fake_getaddrinfo):
        with patch("composio.utils.url_safety.is_blocked_ip", return_value=False):
            with patch("composio.utils.url_safety._PinnedAddressAdapter") as adapter:
                with patch.dict(os.environ, env):
                    with pytest.raises(requests.exceptions.RequestException):
                        safe_get(
                            f"http://{HOSTNAME}:{validated_server.port}/payload",
                            timeout=(1, 1),
                        )

    adapter.assert_not_called()
    assert validated_server.hits == []


@pytest.mark.usefixtures("rebinding_dns")
def test_fetch_connects_to_the_address_it_validated(
    validated_server: _RecordingServer, rebound_server: _RecordingServer
) -> None:
    response = safe_get(
        f"http://{HOSTNAME}:{validated_server.port}/payload", timeout=(5, 5)
    )

    assert response.content == b"public payload"
    assert len(validated_server.hits) == 1
    # The whole point: the rebound endpoint is never even connected to, so
    # neither its body nor a bare TCP connection to it is available to the
    # attacker.
    assert rebound_server.hits == []


@pytest.mark.usefixtures("rebinding_dns")
def test_pinning_keeps_the_hostname_on_the_wire(
    validated_server: _RecordingServer,
) -> None:
    """The address is pinned; the hostname is not replaced by it.

    Pinning by rewriting the connection's host would send ``Host: 127.0.0.1``
    and offer the IP as TLS SNI, which fails certificate verification against
    every real origin.
    """
    safe_get(f"http://{HOSTNAME}:{validated_server.port}/payload", timeout=(5, 5))

    assert validated_server.hits == [f"{HOSTNAME}:{validated_server.port}"]


def test_pinning_still_has_the_urllib3_internals_it_relies_on() -> None:
    """Fail loudly if a urllib3 upgrade removes what the adapter hooks into.

    Silently losing either of these would silently un-pin every connection.
    """
    connection = urllib3.connection.HTTPConnection("example.com")

    assert hasattr(connection, "_new_conn")
    assert hasattr(connection, "_dns_host")


def test_peer_mismatch_fails_closed() -> None:
    """The last line of defence, checked before a byte is written to the socket."""
    sock = MagicMock()
    sock.getpeername.return_value = ("169.254.169.254", 80)

    with pytest.raises(BlockedInternalUrlError, match="169.254.169.254"):
        _assert_pinned_peer(sock, "93.184.216.34", HOSTNAME)

    sock.close.assert_called_once()


def test_connect_falls_back_to_the_next_validated_address(
    no_inherited_proxy: None,
    validated_server: _RecordingServer,
) -> None:
    """A dual-stack host must not be stranded on its first answer.

    ``::1`` is validated but nothing listens there, so the connect has to move
    on to the second answer the way the HTTP client would have. urllib3 rewraps
    connect failures into its own exception hierarchy, none of which inherits
    from ``OSError``, so this also pins down which exceptions the fallback has
    to catch.
    """
    real_getaddrinfo = socket.getaddrinfo

    def fake_getaddrinfo(host, port, *args, **kwargs):  # type: ignore[no-untyped-def]
        if _is_ip_literal(host):
            return real_getaddrinfo(host, port, *args, **kwargs)
        return [
            (
                socket.AF_INET6,
                socket.SOCK_STREAM,
                6,
                "",
                ("::1", validated_server.port, 0, 0),
            ),
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                ("127.0.0.1", validated_server.port),
            ),
        ]

    with patch("socket.getaddrinfo", side_effect=fake_getaddrinfo):
        with patch("composio.utils.url_safety.is_blocked_ip", return_value=False):
            response = safe_get(
                f"http://{HOSTNAME}:{validated_server.port}/payload", timeout=(5, 5)
            )

    assert response.content == b"public payload"
    assert len(validated_server.hits) == 1
