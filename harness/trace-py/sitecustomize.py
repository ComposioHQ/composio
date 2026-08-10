"""Harness-owned httpx tracer, loaded via PYTHONPATH (sitecustomize hook).

Examples must never reference COMPOSIO_TRACE_FILE themselves (lint-enforced).
"""

import json
import os
import re
from urllib.parse import urlsplit

_TRACE = os.environ.get("COMPOSIO_TRACE_FILE")

if _TRACE:
    try:
        import httpx

        _LLM_HOSTS = {
            "api.openai.com",
            "api.anthropic.com",
            "generativelanguage.googleapis.com",
        }
        _BACKEND_HOST = (
            urlsplit(os.environ.get("COMPOSIO_BASE_URL", "https://backend.composio.dev")).hostname
            or "backend.composio.dev"
        )
        _ID_SEG = re.compile(
            r"^(ca_|ac_|ti_|tr_|sess_|auth_|req_|proj_|org_)[\w-]+$"
            r"|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
            r"|^\d+$",
            re.IGNORECASE,
        )

        def _template(path: str) -> str:
            return "/".join("{id}" if _ID_SEG.match(seg) else seg for seg in path.split("/"))

        def _record(obj) -> None:
            try:
                with open(_TRACE, "a") as f:
                    f.write(json.dumps(obj) + "\n")
            except OSError:
                pass

        def _log(request, response) -> None:
            host = request.url.host
            if host == _BACKEND_HOST:
                status = f"{response.status_code // 100}xx" if response is not None else "ERR"
                _record({"m": request.method.upper(), "p": _template(request.url.path), "s": status})
            elif host in _LLM_HOSTS:
                _record({"llm": host})

        # Outbound-email guard: tool executions matching the denylist are
        # refused at the transport, never forwarded to the backend.
        _DENY = re.compile(
            os.environ.get(
                "COMPOSIO_TOOL_DENYLIST",
                r"GMAIL_SEND|GMAIL_REPLY|SEND_EMAIL|SEND_DRAFT|OUTLOOK[A-Z_]*SEND",
            ),
            re.IGNORECASE,
        )

        def _guard(request) -> None:
            if request.url.host == _BACKEND_HOST and _DENY.search(request.url.path):
                _record({"m": request.method.upper(), "p": _template(request.url.path), "s": "BLOCKED"})
                raise RuntimeError(f"harness: outbound-email tool execution blocked ({request.url.path})")

        _orig_send = httpx.Client.send

        def _send(self, request, *args, **kwargs):
            _guard(request)
            response = None
            try:
                response = _orig_send(self, request, *args, **kwargs)
                return response
            finally:
                _log(request, response)

        httpx.Client.send = _send

        _orig_send_async = httpx.AsyncClient.send

        async def _send_async(self, request, *args, **kwargs):
            _guard(request)
            response = None
            try:
                response = await _orig_send_async(self, request, *args, **kwargs)
                return response
            finally:
                _log(request, response)

        httpx.AsyncClient.send = _send_async
    except Exception:  # noqa: BLE001 - tracing must never break the example
        pass
