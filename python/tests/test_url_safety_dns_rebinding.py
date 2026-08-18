"""Tests for the DNS-rebinding guard in ``composio.utils.url_safety``.

``assert_safe_fetch_target`` resolves the hostname to decide whether a URL is
safe, and then the HTTP client resolves the same hostname again when it opens
the connection. An attacker-controlled DNS server can answer differently for
those two lookups, so the pre-flight check alone leaves a time-of-check /
time-of-use window. These tests cover the second layer, which re-checks the
address the socket actually landed on.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from requests.structures import CaseInsensitiveDict

from composio.exceptions import BlockedInternalUrlError
from composio.utils.url_safety import (
    _connected_peer_address,
    assert_safe_connected_peer,
)

_PROXY_ENV_VARS = (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
)


@pytest.fixture(autouse=True)
def _no_ambient_proxy(monkeypatch):
    # The guard deliberately stands down when the request is routed through an
    # environment proxy (the socket's peer is then the proxy, not the target).
    # Clear any proxy configuration inherited from the CI host so these tests
    # exercise the direct-connection path deterministically.
    for var in _PROXY_ENV_VARS:
        monkeypatch.delenv(var, raising=False)


class RawPeer:
    """Marker: ``getpeername`` returns the wrapped value verbatim.

    Used for peers that are not address tuples, such as the plain path
    string an ``AF_UNIX`` socket reports.
    """

    def __init__(self, value):
        self.value = value


class FakeSocket:
    """Socket stand-in whose ``getpeername`` is scripted by the test."""

    def __init__(self, peer):
        self._peer = peer

    def getpeername(self):
        if isinstance(self._peer, BaseException):
            raise self._peer
        if isinstance(self._peer, RawPeer):
            return self._peer.value
        if isinstance(self._peer, str):
            return (self._peer, 443)
        return self._peer


class FakeConnection:
    def __init__(self, sock):
        self.sock = sock


class FakeRaw:
    def __init__(self, connection):
        self.connection = connection


class FakeResponse:
    """Minimal ``requests.Response`` stand-in exposing a peer socket."""

    def __init__(self, peer=None, *, raw=..., connection=...):
        self.closed = False
        if raw is not ...:
            self.raw = raw
        elif connection is not ...:
            self.raw = FakeRaw(connection)
        else:
            self.raw = FakeRaw(FakeConnection(FakeSocket(peer)))

    def close(self):
        self.closed = True


BLOCKED_PEERS = [
    "127.0.0.1",
    "169.254.169.254",  # cloud instance metadata
    "10.0.0.5",
    "172.16.3.9",
    "192.168.1.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "::ffff:127.0.0.1",  # IPv4-mapped loopback
    "not-an-ip",  # unparseable: fail closed
]

PUBLIC_PEERS = [
    "93.184.216.34",
    "8.8.8.8",
    "2606:2800:220:1:248:1893:25c8:1946",
]


@pytest.mark.parametrize("peer", BLOCKED_PEERS)
def test_blocked_peer_is_rejected_and_connection_closed(peer):
    response = FakeResponse(peer)

    with pytest.raises(BlockedInternalUrlError) as exc:
        assert_safe_connected_peer(response, "https://rebind.example.com/file.png")

    assert peer in str(exc.value)
    assert "rebind.example.com" in str(exc.value)
    assert response.closed, "the connection must be dropped before reading a body"


@pytest.mark.parametrize("peer", PUBLIC_PEERS)
def test_public_peer_is_allowed(peer):
    response = FakeResponse(peer)

    assert_safe_connected_peer(response, "https://example.com/file.png")

    assert not response.closed


def test_ipv6_peername_tuple_is_understood():
    # IPv6 sockets return a four-tuple rather than a two-tuple.
    response = FakeResponse(("::1", 443, 0, 0))

    with pytest.raises(BlockedInternalUrlError):
        assert_safe_connected_peer(response, "https://rebind.example.com/file.png")


def test_error_message_does_not_leak_the_url_query_string():
    response = FakeResponse("127.0.0.1")

    with pytest.raises(BlockedInternalUrlError) as exc:
        assert_safe_connected_peer(
            response, "https://rebind.example.com/file.png?token=supersecret"
        )

    assert "supersecret" not in str(exc.value)


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(raw=None),
        FakeResponse(connection=None),
        FakeResponse(None),
        FakeResponse(OSError("socket already released")),
        FakeResponse(AttributeError("no getpeername")),
        FakeResponse(RawPeer("/tmp/unix.sock")),  # AF_UNIX peername is not a tuple
    ],
)
def test_undeterminable_peer_is_left_alone(response):
    # There is nothing to check, and assert_safe_fetch_target already ran, so
    # the response is passed through rather than rejected. Documented in
    # assert_safe_connected_peer.
    assert_safe_connected_peer(response, "https://example.com/file.png")

    assert not response.closed


@pytest.mark.parametrize(
    "proxy_var", ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]
)
def test_private_proxy_peer_is_not_mistaken_for_rebinding(monkeypatch, proxy_var):
    # requests honors HTTP(S)_PROXY / ALL_PROXY by default (trust_env=True),
    # so the client socket is connected to the *proxy* and getpeername()
    # reports the proxy's address -- commonly loopback or RFC 1918. That is
    # operator configuration, not a DNS rebind, and must not be rejected.
    monkeypatch.setenv(proxy_var, "http://127.0.0.1:8080")
    response = FakeResponse("127.0.0.1")

    assert_safe_connected_peer(response, "https://example.com/file.png")

    assert not response.closed


def test_no_proxy_exemption_restores_the_peer_check(monkeypatch):
    # A host exempted via NO_PROXY connects directly, so the peer really is
    # the target and a rebound internal address must still be rejected.
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:8080")
    monkeypatch.setenv("NO_PROXY", "rebind.example.com")
    response = FakeResponse("169.254.169.254")

    with pytest.raises(BlockedInternalUrlError):
        assert_safe_connected_peer(response, "https://rebind.example.com/file.png")

    assert response.closed


def test_connected_peer_address_returns_the_address():
    assert _connected_peer_address(FakeResponse("93.184.216.34")) == "93.184.216.34"


def test_connected_peer_address_returns_none_when_unavailable():
    assert _connected_peer_address(FakeResponse(raw=None)) is None
    assert _connected_peer_address(FakeResponse(connection=None)) is None
    assert _connected_peer_address(FakeResponse(None)) is None


def test_fetch_file_from_url_rejects_a_rebound_host():
    """End-to-end: validation sees a public IP, the socket lands on loopback."""
    from composio.core.models import _files

    public_answer = [(2, 1, 6, "", ("93.184.216.34", 0))]
    response = FakeResponse("169.254.169.254")

    with patch(
        "composio.utils.url_safety.socket.getaddrinfo", return_value=public_answer
    ), patch.object(_files.requests, "get", return_value=response):
        with pytest.raises(BlockedInternalUrlError) as exc:
            _files._fetch_file_from_url("https://rebind.example.com/file.png")

    assert "169.254.169.254" in str(exc.value)
    assert response.closed


def test_fetch_file_from_url_allows_a_stable_public_host():
    """The guard must not reject an ordinary fetch."""
    from composio.core.models import _files

    public_answer = [(2, 1, 6, "", ("93.184.216.34", 0))]
    response = FakeResponse("93.184.216.34")
    response.status_code = 200
    response.ok = True
    response.headers = CaseInsensitiveDict(
        {"Content-Type": "image/png", "Content-Length": "4"}
    )
    response.iter_content = lambda chunk_size: iter([b"data"])

    with patch(
        "composio.utils.url_safety.socket.getaddrinfo", return_value=public_answer
    ), patch.object(_files.requests, "get", return_value=response):
        name, content, mimetype = _files._fetch_file_from_url(
            "https://example.com/file.png"
        )

    assert content == b"data"
    assert name == "file.png"
    assert mimetype == "image/png"
