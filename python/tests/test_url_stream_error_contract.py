"""Mid-stream transport failures must surface through the declared error
contracts, not leak as bare requests exceptions past the _UrlFetchError /
ErrorUploadingFile mappings."""

import requests

import composio.core.models._files as files_mod
import composio.core.models.tool_router_session_files as trsf_mod


class _MidStreamResetResponse:
    """A response that delivers headers + one chunk, then dies mid-stream."""

    headers = {"Content-Length": "100"}
    status_code = 200
    ok = True
    reason = "OK"

    def close(self):
        pass

    def iter_content(self, chunk_size=8192):
        yield b"partial"
        raise requests.exceptions.ConnectionError("peer reset mid-stream")


def test_tool_router_fetch_maps_midstream_failure(monkeypatch):
    monkeypatch.setattr(trsf_mod, "safe_get", lambda url, **kw: _MidStreamResetResponse())
    # Before the fix this leaked requests.exceptions.ConnectionError past the
    # ValidationError mapping the function declares.
    try:
        trsf_mod._fetch_from_url("https://example.com/file")
        raise AssertionError("expected ValidationError")
    except trsf_mod.ValidationError as e:
        assert "peer reset mid-stream" in str(e)
    except requests.exceptions.RequestException:
        raise AssertionError("transport exception leaked outside the contract")


def test_files_fetch_maps_midstream_failure(monkeypatch):
    monkeypatch.setattr(files_mod, "safe_get", lambda url, **kw: _MidStreamResetResponse())
    try:
        files_mod._fetch_file_from_url("https://example.com/file")
        raise AssertionError("expected ErrorUploadingFile")
    except files_mod.ErrorUploadingFile as e:
        assert "peer reset mid-stream" in str(e)
    except requests.exceptions.RequestException:
        raise AssertionError("transport exception leaked outside the contract")
