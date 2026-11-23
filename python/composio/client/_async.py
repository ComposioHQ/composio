"""SDK transport for the native asyncio resources."""

import logging
from collections.abc import Mapping
from typing import Any, Self

import httpx
from composio_client import (
    DEFAULT_MAX_RETRIES,
    NOT_GIVEN,
    APIStatusError,
    AsyncComposio,
    Auth,
    ClientIdentity,
    NotGiven,
    Scope,
)

from composio.client import (
    APIEnvironment,
    _active_log_wrapper,
    _as_sdk_error,
    _client_identity,
    _headers_with_request_id,
    _install_client_log_forwarder,
    _new_request_context,
)
from composio.utils.logging import LogLevel, WithLogger
from composio.utils.toolkit_deprecation import install_async_hook


class AsyncHttpClient(AsyncComposio, WithLogger):
    """Generated async resources with the SDK's identity, errors, and request context.

    As in the generated client, closing the client closes its HTTP transport,
    including an injected AsyncClient. Retry-disabled siblings share that pool.
    """

    not_given = NOT_GIVEN

    def __init__(
        self,
        *,
        provider: str,
        auth: Auth,
        scope: Scope | None = None,
        environment: APIEnvironment | NotGiven = "production",
        base_url: str | httpx.URL | None | NotGiven = NOT_GIVEN,
        timeout: float | httpx.Timeout | None | NotGiven = NOT_GIVEN,
        max_retries: int = DEFAULT_MAX_RETRIES,
        default_headers: Mapping[str, str | None] | None = None,
        identity: ClientIdentity | None = None,
        http_client: httpx.AsyncClient | None = None,
        logger: logging.Logger | None = None,
        logging_level: LogLevel | None = None,
        allow_tracking: bool = True,
        _strict_response_validation: bool = False,
    ) -> None:
        WithLogger.__init__(self, logger=logger, logging_level=logging_level)
        super().__init__(
            auth=auth,
            scope=scope,
            environment=environment,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
            default_headers=default_headers,
            identity=identity if identity is not None else _client_identity(provider),
            http_client=http_client,
            _strict_response_validation=_strict_response_validation,
        )
        self.allow_tracking = allow_tracking
        self.sdk_auth = auth
        self.provider = provider
        self.request_ctx = _new_request_context(provider)
        self._without_retries: Self | None = None
        _install_client_log_forwarder(self._logger)
        install_async_hook(self._client)

    async def __aenter__(self) -> Self:
        return self

    def with_options(
        self,
        *,
        auth: Auth | NotGiven = NOT_GIVEN,
        scope: Scope | None | NotGiven = NOT_GIVEN,
        environment: APIEnvironment | None = None,
        base_url: str | httpx.URL | None = None,
        timeout: float | httpx.Timeout | None | NotGiven = NOT_GIVEN,
        http_client: httpx.AsyncClient | None = None,
        max_retries: int | NotGiven = NOT_GIVEN,
        default_headers: Mapping[str, str | None] | None = None,
        set_default_headers: Mapping[str, str | None] | None = None,
        identity: ClientIdentity | None = None,
        _extra_kwargs: Mapping[str, Any] = {},
    ) -> Self:
        clone = super().with_options(
            auth=auth,
            scope=scope,
            environment=environment,
            base_url=base_url,
            timeout=timeout,
            http_client=http_client,
            max_retries=max_retries,
            default_headers=default_headers,
            set_default_headers=set_default_headers,
            identity=identity,
            _extra_kwargs={
                "provider": self.provider,
                "allow_tracking": self.allow_tracking,
                "logger": self._logger.logger,
                **_extra_kwargs,
            },
        )
        clone.request_ctx = self.request_ctx
        return clone

    @property
    def without_retries(self) -> Self:
        """Share the HTTP pool and request context for single-attempt executions."""
        if self._without_retries is None:
            self._without_retries = self.with_options(max_retries=0)
        return self._without_retries

    async def _request_response(
        self, method: str, path: str, **kwargs: Any
    ) -> tuple[httpx.Response, int]:
        # Typed resources and raw verbs both enter here. Binding the ContextVar
        # across the await keeps concurrent instances' logs on their own logger.
        token = _active_log_wrapper.set(self._logger)
        try:
            return await super()._request_response(method, path, **kwargs)
        finally:
            _active_log_wrapper.reset(token)

    def _make_status_error(
        self, err_msg: str, *, body: object, response: httpx.Response
    ) -> APIStatusError:
        return _as_sdk_error(
            super()._make_status_error(err_msg, body=body, response=response)
        )

    def _headers_for(self, url: str, **kwargs: Any) -> dict[str, str]:
        return _headers_with_request_id(
            super()._headers_for(url, **kwargs),
            url,
            httpx.URL(self.base_url),
            self.request_ctx.get(),
        )
