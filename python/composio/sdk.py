from __future__ import annotations

import os
import typing as t

import typing_extensions as te

from composio import exceptions
from composio.client import DEFAULT_MAX_RETRIES, APIEnvironment, HttpClient
from composio.core.models import (
    AuthConfigs,
    ConnectedAccounts,
    ToolRouter,
    Toolkits,
    Tools,
    Triggers,
)
from composio.core.models.base import allow_tracking
from composio.core.models.mcp import MCP
from composio.core.provider import TProvider
from composio.core.provider._openai import OpenAIProvider
from composio.core.types import ToolkitVersionParam
from composio.utils.logging import WithLogger
from composio.utils.toolkit_version import get_toolkit_versions

_DEFAULT_PROVIDER = OpenAIProvider()


class SDKConfig(te.TypedDict):
    environment: te.NotRequired[APIEnvironment]
    api_key: te.NotRequired[str]
    base_url: te.NotRequired[str]
    timeout: te.NotRequired[int]
    max_retries: te.NotRequired[int]
    allow_tracking: te.NotRequired[bool]
    file_download_dir: te.NotRequired[str]
    toolkit_versions: te.NotRequired[ToolkitVersionParam]


# class ExperimentalNamespace:
#     """Namespace for experimental Composio features."""

#     def __init__(self, tool_router: ToolRouter):
#         """
#         Initialize experimental namespace.

#         :param tool_router: Experimental ToolRouter instance
#         """
#         self.tool_router = tool_router


class Composio(t.Generic[TProvider], WithLogger):
    """
    Composio SDK for Python.
    """

    tools: Tools[TProvider]
    tool_router: ToolRouter[TProvider]
    # experimental: ExperimentalNamespace

    def __init__(
        self,
        provider: TProvider = _DEFAULT_PROVIDER,  # type: ignore
        **kwargs: te.Unpack[SDKConfig],
    ) -> None:
        """
        Initialize the Composio SDK.

        :param provider: The provider to use for the SDK.
        :param environment: The environment to use for the SDK.
        :param api_key: The API key to use for the SDK.
        :param base_url: The base URL to use for the SDK.
        :param timeout: The timeout to use for the SDK.
        :param max_retries: The maximum number of retries to use for the SDK.
        :param toolkit_versions: A dictionary mapping toolkit names to specific versions:
                                - A dictionary mapping toolkit names to specific versions
                                - A string (e.g., 'latest', '20250906_01') to use the same version for all toolkits
                                - None or omitted to use 'latest' as default
        """
        WithLogger.__init__(self)
        api_key = kwargs.get("api_key", os.environ.get("COMPOSIO_API_KEY"))
        if not api_key:
            raise exceptions.ApiKeyNotProvidedError()

        # Process toolkit versions with environment variable support
        toolkit_versions = get_toolkit_versions(kwargs.get("toolkit_versions"))

        allow_tracking.set(kwargs.get("allow_tracking", True))
        self._client = HttpClient(
            environment=kwargs.get("environment", "production"),
            provider=provider.name,
            api_key=api_key,
            base_url=kwargs.get("base_url"),
            timeout=kwargs.get("timeout"),
            max_retries=kwargs.get("max_retries", DEFAULT_MAX_RETRIES),
        )
        self.provider = provider
        self.tools = Tools(
            client=self._client,
            provider=self.provider,
            file_download_dir=kwargs.get("file_download_dir"),
            toolkit_versions=toolkit_versions,
        )

        self.toolkits = Toolkits(client=self._client)
        self.triggers = Triggers(client=self._client, toolkit_versions=toolkit_versions)
        self.auth_configs = AuthConfigs(client=self._client)
        self.connected_accounts = ConnectedAccounts(client=self._client)
        self.mcp = MCP(client=self._client)

        # initialize tool router methods
        self.tool_router = ToolRouter(
            client=self._client,
            provider=self.provider,
        )
        self.create = self.tool_router.create
        self.use = self.tool_router.use

    @property
    def client(self):
        return self._client
