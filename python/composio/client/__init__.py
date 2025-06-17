"""
This module is a light wrapper around the auto-generated composio client.
"""

import contextvars
import typing as t
from uuid import uuid4

import typing_extensions as te
from composio_client import (
    DEFAULT_MAX_RETRIES,
    NOT_GIVEN,
    APIError,
    NotGiven,
    _base_client,
)
from composio_client import Composio as BaseComposio
from httpx import URL, Client, Request, Timeout

from composio.utils.logging import WithLogger

ComposioAPIError = APIError
APIEnvironment = te.Literal["production", "staging", "local"]


class RequestContext(te.TypedDict):
    id: te.NotRequired[t.Optional[str]]
    provider: str


# TODO: Rename `Composio` to `HttpClient` in stainless generator
class HttpClient(BaseComposio, WithLogger):
    """
    Wrapper around the auto-generated composio client.
    """

    request_ctx: contextvars.ContextVar[RequestContext]
    not_given = NOT_GIVEN

    def __init__(
        self,
        *,
        provider: str,
        api_key: t.Optional[str] = None,
        environment: te.Union[NotGiven, APIEnvironment] = "production",
        base_url: t.Optional[t.Union[str, URL, NotGiven]] = NOT_GIVEN,
        timeout: t.Optional[t.Union[float, Timeout, NotGiven]] = NOT_GIVEN,
        max_retries: int = DEFAULT_MAX_RETRIES,
        default_headers: t.Optional[t.Mapping[str, str]] = None,
        default_query: t.Optional[t.Mapping[str, object]] = None,
        http_client: t.Optional[Client] = None,
        _strict_response_validation: bool = False,
    ) -> None:
        """
        Initialize the client.

        :param provider: The provider to use for the client.
        :param api_key: The API key to use for the client.
        :param environment: The environment to use for the client.
        :param base_url: The base URL to use for the client.
        :param timeout: The timeout to use for the client.
        :param max_retries: The maximum number of retries to use for the client.
        :param default_headers: The default headers to use for the client.
        :param default_query: The default query parameters to use for the client.
        :param http_client: The HTTP client to use for the client.
        """
        WithLogger.__init__(self)
        BaseComposio.__init__(
            self,
            api_key=api_key,
            environment=environment,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
            default_headers=default_headers,
            default_query=default_query,
            http_client=http_client,
            _strict_response_validation=_strict_response_validation,
        )
        # TOFIX: Verbosity wrapper impl
        _base_client.log = self._logger  # type: ignore
        self.provider = provider
        self.request_ctx = contextvars.ContextVar[RequestContext](
            "request_ctx",
            default={
                "id": None,
                "provider": provider,
            },
        )

    def _prepare_request(self, request: Request) -> None:
        """
        Request interceptor to inject request id and provider.
        """
        ctx = self.request_ctx.get()
        request.headers["x-request-id"] = ctx.get("id") or uuid4().hex
        request.headers["x-framework-provider"] = ctx["provider"]
