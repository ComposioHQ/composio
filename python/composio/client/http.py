"""
Http client implementation for Composio SDK
"""

import typing as t

from requests import ReadTimeout
from requests import Session as SyncSession

from composio.__version__ import __version__
from composio.exceptions import SDKTimeoutError
from composio.utils import logging
from composio.utils.shared import generate_request_id


DEFAULT_RUNTIME = "composio"
SOURCE_HEADER = "python_sdk"
DEFAULT_REQUEST_TIMEOUT = 60.0


class HttpClient(SyncSession, logging.WithLogger):
    """HTTP client for Composio"""

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
                "x-composio-version": __version__,
            }
        )
        self.timeout = timeout or DEFAULT_REQUEST_TIMEOUT

    def _wrap(self, method: t.Callable) -> t.Callable:
        """Wrap http request."""

        def request(url: str, **kwargs: t.Any) -> t.Any:
            """Perform HTTP request."""
            rid = generate_request_id()
            self._logger.debug(
                f"[{rid}] {method.__name__.upper()} {self.base_url}{url} - {kwargs}"
            )
            retries = 0
            while retries < 3:
                try:
                    return method(
                        url=f"{self.base_url}{url}",
                        timeout=self.timeout,
                        headers={
                            **kwargs.pop("headers", {}),
                            "x-request-id": rid,
                        },
                        **kwargs,
                    )
                except ReadTimeout:
                    retries += 1
            raise SDKTimeoutError("Timed out while waiting for request to complete")

        return request

    def __getattribute__(self, name: str) -> t.Any:
        if name in ("get", "post", "put", "delete", "patch"):
            return self._wrap(super().__getattribute__(name))
        return super().__getattribute__(name)
