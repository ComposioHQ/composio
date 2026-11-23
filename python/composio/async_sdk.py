"""Native asyncio client for the Python SDK."""

from __future__ import annotations

import os
import typing as t
import warnings
from types import TracebackType

import httpx
import typing_extensions as te

from composio import exceptions
from composio.client import DEFAULT_MAX_RETRIES
from composio.client._async import AsyncHttpClient
from composio.core.models._async_resources import (
    AsyncAuthConfigs,
    AsyncConnectedAccounts,
    AsyncExperimentalAPI,
    AsyncKeyring,
    AsyncLogs,
    AsyncMCP,
    AsyncToolkits,
    AsyncTriggers,
    AsyncWebhooks,
)
from composio.core.models._async_sessions import AsyncToolRouter
from composio.core.models._async_tools import AsyncTools
from composio.core.provider import TTool, TToolCollection
from composio.core.provider._openai import (
    OpenAIProvider,
    OpenAITool,
    OpenAIToolCollection,
)
from composio.core.provider.base import BaseProvider
from composio.sdk import (
    _TOOL_ROUTER_DEPRECATION,
    _auth_and_scope,
    _CommonSDKConfig,
    _custom_headers,
)
from composio.utils.logging import WithLogger
from composio.utils.toolkit_version import get_toolkit_versions


class AsyncSDKConfig(_CommonSDKConfig):
    http_client: te.NotRequired[httpx.AsyncClient]


class AsyncComposio(t.Generic[TTool, TToolCollection], WithLogger):
    """Asynchronous Composio SDK. Use one client per application event loop.

    Enter an async context or call `await client.aclose()` on shutdown. Closing
    the SDK also closes an HTTPX async client supplied through `http_client`.
    Credentials, scope and toolkit versions follow the same rules as Composio.
    """

    @t.overload
    def __init__(
        self: AsyncComposio[OpenAITool, OpenAIToolCollection],
        provider: None = None,
        **kwargs: te.Unpack[AsyncSDKConfig],
    ) -> None: ...

    @t.overload
    def __init__(
        self,
        provider: BaseProvider[TTool, TToolCollection],
        **kwargs: te.Unpack[AsyncSDKConfig],
    ) -> None: ...

    def __init__(
        self,
        provider: BaseProvider[t.Any, t.Any] | None = None,
        **kwargs: te.Unpack[AsyncSDKConfig],
    ) -> None:
        super().__init__(
            logger=kwargs.get("logger"), logging_level=kwargs.get("logging_level")
        )
        auth, scope = _auth_and_scope(kwargs)
        # Provider instances can carry a callback bound to a synchronous client.
        # Keep the async client's binding local to this instance.
        self.provider: BaseProvider[TTool, TToolCollection] = t.cast(
            BaseProvider[TTool, TToolCollection],
            provider._for_async_client() if provider is not None else OpenAIProvider(),
        )
        toolkit_versions = get_toolkit_versions(kwargs.get("toolkit_versions"))
        self._client = AsyncHttpClient(
            environment=kwargs.get("environment", "production"),
            provider=self.provider.name,
            allow_tracking=kwargs.get("allow_tracking", True),
            auth=auth,
            scope=scope,
            base_url=kwargs.get("base_url") or os.environ.get("COMPOSIO_BASE_URL"),
            timeout=kwargs.get("timeout"),
            max_retries=kwargs.get("max_retries", DEFAULT_MAX_RETRIES),
            default_headers=_custom_headers(),
            http_client=kwargs.get("http_client"),
            logger=kwargs.get("logger"),
            logging_level=kwargs.get("logging_level"),
        )
        self.tools: AsyncTools[TTool, TToolCollection] = AsyncTools(
            client=self._client,
            provider=self.provider,
            file_download_dir=kwargs.get("file_download_dir"),
            toolkit_versions=toolkit_versions,
            dangerously_allow_auto_upload_download_files=kwargs.get(
                "dangerously_allow_auto_upload_download_files", False
            ),
            sensitive_file_upload_protection=kwargs.get(
                "sensitive_file_upload_protection", True
            ),
            file_upload_path_deny_segments=kwargs.get("file_upload_path_deny_segments"),
            file_upload_dirs=kwargs.get("file_upload_dirs"),
        )
        self.toolkits = AsyncToolkits(client=self._client)
        self.triggers = AsyncTriggers(
            client=self._client, toolkit_versions=toolkit_versions
        )
        self.auth_configs = AsyncAuthConfigs(client=self._client)
        self.connected_accounts = AsyncConnectedAccounts(client=self._client)
        self.mcp = AsyncMCP(client=self._client)
        self.webhooks = AsyncWebhooks(client=self._client)
        self.logs = AsyncLogs(client=self._client)
        self.keyring = AsyncKeyring(client=self._client)
        self.experimental = AsyncExperimentalAPI(client=self._client)
        self.custom_toolkits = self.experimental.custom_toolkits
        self.sessions: AsyncToolRouter[TTool, TToolCollection] = AsyncToolRouter(
            client=self._client,
            provider=self.provider,
            dangerously_allow_auto_upload_download_files=kwargs.get(
                "dangerously_allow_auto_upload_download_files", False
            ),
            sensitive_file_upload_protection=kwargs.get(
                "sensitive_file_upload_protection", True
            ),
            file_upload_path_deny_segments=kwargs.get("file_upload_path_deny_segments"),
            file_upload_dirs=kwargs.get("file_upload_dirs"),
        )
        self.create = self.sessions.create
        self.use = self.sessions.use

    @property
    def client(self) -> AsyncHttpClient:
        """Access the generated async resources using this SDK client's configuration."""
        return self._client

    @property
    @te.deprecated(_TOOL_ROUTER_DEPRECATION, category=None)
    def tool_router(self) -> AsyncToolRouter[TTool, TToolCollection]:
        """Deprecated alias for sessions."""
        warnings.warn(
            _TOOL_ROUTER_DEPRECATION,
            exceptions.ComposioDeprecationWarning,
            stacklevel=2,
        )
        return self.sessions

    async def __aenter__(self) -> te.Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Stop realtime subscriptions and close the shared HTTP connection pool."""
        try:
            await self.triggers.aclose()
        finally:
            await self._client.aclose()
