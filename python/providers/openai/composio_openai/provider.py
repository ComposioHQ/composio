"""
OpenAI Provider for composio SDK.
"""

from __future__ import annotations

import typing as t

from openai import OpenAI

from composio.core.provider._openai import OpenAIProvider
from composio.core.provider._openai_responses import OpenAIResponsesProvider

QIANFAN_BASE_URL = "https://qianfan.baidubce.com/v2"


def _build_qianfan_headers(
    appid: str | None = None,
    default_headers: dict[str, str] | None = None,
) -> dict[str, str]:
    headers = dict(default_headers or {})
    if appid:
        headers["appid"] = appid
    return headers


def create_qianfan_client(
    *,
    api_key: str,
    appid: str | None = None,
    base_url: str = QIANFAN_BASE_URL,
    default_headers: dict[str, str] | None = None,
    **kwargs: t.Any,
) -> OpenAI:
    return OpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers=_build_qianfan_headers(appid, default_headers),
        **kwargs,
    )


def create_qianfan_responses_client(
    *,
    api_key: str,
    appid: str | None = None,
    base_url: str = QIANFAN_BASE_URL,
    default_headers: dict[str, str] | None = None,
    **kwargs: t.Any,
) -> OpenAI:
    return OpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers=_build_qianfan_headers(appid, default_headers),
        **kwargs,
    )


__all__ = [
    "OpenAIProvider",
    "OpenAIResponsesProvider",
    "QIANFAN_BASE_URL",
    "create_qianfan_client",
    "create_qianfan_responses_client",
]
