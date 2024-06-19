"""
Http client implementation for Composio SDK
"""

import typing as t
from asyncio import AbstractEventLoop

from aiohttp import ClientSession as AsyncSession
from requests import Session as SyncSession


class AsyncHttpClient(AsyncSession):
    """Async HTTP client for Composio"""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        loop: t.Optional[AbstractEventLoop] = None,
    ) -> None:
        """
        Initialize async client channel for Composio API

        :param base_url: Base URL for Composio API
        :param api_key: API key for Composio API
        :param loop: Event for execution requests
        """
        super().__init__(loop=loop, headers={"x-api-key": api_key})
        self.base_url = base_url

    def _wrap(self, method: t.Callable) -> t.Callable:
        """Wrap http request."""

        def request(url: str, **kwargs: t.Any) -> t.Any:
            """Perform HTTP request."""
            return method(url=f"{self.base_url}{url}", **kwargs)

        return request

    def __getattribute__(self, name: str) -> t.Any:
        if name in ("get", "post", "put", "delete"):
            return self._wrap(super().__getattribute__(name))
        return super().__getattribute__(name)


class HttpClient(SyncSession):
    """Async HTTP client for Composio"""

    def __init__(self, base_url: str, api_key: str) -> None:
        """
        Initialize client channel for Composio API

        :param base_url: Base URL for Composio API
        :param api_key: API key for Composio API
        """
        super().__init__()
        self.base_url = base_url
        self.headers.update({"x-api-key": api_key})

    def _wrap(self, method: t.Callable) -> t.Callable:
        """Wrap http request."""

        def request(url: str, **kwargs: t.Any) -> t.Any:
            """Perform HTTP request."""
            return method(url=f"{self.base_url}{url}", **kwargs)

        return request

    def __getattribute__(self, name: str) -> t.Any:
        if name in ("get", "post", "put", "delete", "patch"):
            return self._wrap(super().__getattribute__(name))
        return super().__getattribute__(name)
