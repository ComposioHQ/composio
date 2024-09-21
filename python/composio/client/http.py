"""
Http client implementation for Composio SDK
"""

import typing as t
from asyncio import AbstractEventLoop

from aiohttp import ClientSession as AsyncSession
from requests import ReadTimeout
from requests import Session as SyncSession

from composio.utils import logging


DEFAULT_RUNTIME = "composio"
SOURCE_HEADER = "python_sdk"
DEFAULT_REQUEST_TIMEOUT = 60.0


class AsyncHttpClient(AsyncSession, logging.WithLogger):
    """Async HTTP client for Composio"""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        runtime: t.Optional[str] = None,
        loop: t.Optional[AbstractEventLoop] = None,
        timeout: t.Optional[float] = None,
    ) -> None:
        """
        Initialize async client channel for Composio API

        :param base_url: Base URL for Composio API
        :param api_key: API key for Composio API
        :param runtime: Runtime specifier
        :param timeout: Request timeout
        :param loop: Event for execution requests
        """
        AsyncSession.__init__(
            self,
            loop=loop,
            headers={
                "x-api-key": api_key,
                "x-source": SOURCE_HEADER,
                "x-runtime": runtime or DEFAULT_RUNTIME,
            },
        )
        logging.WithLogger.__init__(self)
        self.base_url = base_url
        self._request_timeout = timeout or DEFAULT_REQUEST_TIMEOUT

    def _wrap(self, method: t.Callable) -> t.Callable:
        """Wrap http request."""

        def request(url: str, **kwargs: t.Any) -> t.Any:
            """Perform HTTP request."""
            self._logger.debug(
                f"{method.__name__.upper()} {self.base_url}{url} - {kwargs}"
            )
            return method(url=f"{self.base_url}{url}", **kwargs)

        return request

    def __getattribute__(self, name: str) -> t.Any:
        if name in ("get", "post", "put", "delete", "patch"):
            return self._wrap(super().__getattribute__(name))
        return super().__getattribute__(name)


class HttpClient(SyncSession, logging.WithLogger):
    """Async HTTP client for Composio"""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        runtime: t.Optional[str] = None,
        timeout: t.Optional[float] = None,
    ) -> None:
        """
        Initialize client channel for Composio API

        :param base_url: Base URL for Composio API
        :param api_key: API key for Composio API
        :param runtime: Runtime specifier
        :param timeout: Request timeout
        """
        SyncSession.__init__(self)
        logging.WithLogger.__init__(self)
        self.base_url = base_url
        self.headers.update(
            {
                "x-api-key": api_key,
                "x-source": SOURCE_HEADER,
                "x-runtime": runtime or DEFAULT_RUNTIME,
            }
        )
        self.timeout = timeout or DEFAULT_REQUEST_TIMEOUT

    def _wrap(self, method: t.Callable) -> t.Callable:
        """Wrap http request."""

        def request(url: str, **kwargs: t.Any) -> t.Any:
            """Perform HTTP request."""
            self._logger.debug(
                f"{method.__name__.upper()} {self.base_url}{url} - {kwargs}"
            )
            retries = 0
            while retries < 3:
                try:
                    return method(
                        url=f"{self.base_url}{url}",
                        timeout=self.timeout,
                        **kwargs,
                    )
                except ReadTimeout:
                    retries += 1
            raise TimeoutError("Timed out while waiting for request to complete")

        return request

    def __getattribute__(self, name: str) -> t.Any:
        if name in ("get", "post", "put", "delete", "patch"):
            return self._wrap(super().__getattribute__(name))
        return super().__getattribute__(name)
