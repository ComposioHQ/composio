from __future__ import annotations

import os
import typing as t

import typing_extensions as te

from composio import exceptions
from composio.client import DEFAULT_MAX_RETRIES, APIEnvironment, HttpClient
from composio.core.models import (
    AuthConfigs,
    ConnectedAccounts,
    Toolkits,
    ToolRouter,
    Tools,
    Triggers,
)
from composio.core.models.base import allow_tracking
from composio.core.models.mcp import MCP
from composio.core.provider import TTool, TToolCollection
from composio.core.provider._openai import (
    OpenAIProvider,
    OpenAITool,
    OpenAIToolCollection,
)
from composio.core.provider.base import BaseProvider
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
    auto_upload_download_files: te.NotRequired[bool]
    sensitive_file_upload_protection: te.NotRequired[bool]
    file_upload_path_deny_segments: te.NotRequired[t.Sequence[str]]


class Composio(t.Generic[TTool, TToolCollection], WithLogger):
    """
    Composio SDK for Python.

    Generic parameters:
        TTool: The individual tool type returned by the provider (e.g., ChatCompletionToolParam for OpenAI).
        TToolCollection: The collection type returned by get_tools (e.g., list[ChatCompletionToolParam]).

    The generic types are automatically inferred from the provider passed to __init__.
    When no provider is passed, defaults to OpenAI types.

    Examples:
        # Implicit type inference - recommended
        composio = Composio(provider=OpenAIProvider())  # Composio[OpenAITool, list[OpenAITool]]
        composio = Composio(provider=AnthropicProvider())  # Composio[ToolParam, list[ToolParam]]
        composio = Composio()  # Composio[OpenAITool, list[OpenAITool]] (default)

        # Custom provider - types are inferred automatically
        composio = Composio(provider=MyCustomProvider())  # Composio[MyTool, list[MyTool]]
    """

    tools: "Tools[TTool, TToolCollection]"
    tool_router: "ToolRouter[TTool, TToolCollection]"

    @t.overload
    def __init__(
        self: "Composio[OpenAITool, OpenAIToolCollection]",
        provider: None = None,
        **kwargs: te.Unpack[SDKConfig],
    ) -> None:
        """Initialize with default OpenAI provider."""
        ...

    @t.overload
    def __init__(
        self,
        provider: BaseProvider[TTool, TToolCollection],
        **kwargs: te.Unpack[SDKConfig],
    ) -> None:
        """Initialize with an explicit provider. Types are inferred from the provider."""
        ...

    def __init__(
        self,
        provider: t.Optional[BaseProvider[t.Any, t.Any]] = None,
        **kwargs: te.Unpack[SDKConfig],
    ) -> None:
        """
        Initialize the Composio SDK.

        :param provider: The provider to use for the SDK. Defaults to OpenAIProvider.
        :param environment: The environment to use for the SDK.
        :param api_key: The API key to use for the SDK.
        :param base_url: The base URL to use for the SDK.
        :param timeout: The timeout to use for the SDK.
        :param max_retries: The maximum number of retries to use for the SDK.
        :param toolkit_versions: A dictionary mapping toolkit names to specific versions:
                                - A dictionary mapping toolkit names to specific versions
                                - A string (e.g., 'latest', '20250906_01') to use the same version for all toolkits
                                - None or omitted to use 'latest' as default
        :param auto_upload_download_files: Whether to automatically upload and download files. Defaults to True.
        :param sensitive_file_upload_protection: When True, block local paths on the built-in sensitive-path denylist before upload. Defaults to True.
        :param file_upload_path_deny_segments: Extra path segment names merged with the built-in denylist.
        """
        WithLogger.__init__(self)
        api_key = kwargs.get("api_key", os.environ.get("COMPOSIO_API_KEY"))
        if not api_key:
            raise exceptions.ApiKeyNotProvidedError()

        # Use default provider if none provided
        # Cast to BaseProvider[TTool, TToolCollection] for type consistency
        actual_provider: BaseProvider[TTool, TToolCollection] = t.cast(
            BaseProvider[TTool, TToolCollection],
            provider if provider is not None else _DEFAULT_PROVIDER,
        )

        # Process toolkit versions with environment variable support
        toolkit_versions = get_toolkit_versions(kwargs.get("toolkit_versions"))

        allow_tracking.set(kwargs.get("allow_tracking", True))
        self._client = HttpClient(
            environment=kwargs.get("environment", "production"),
            provider=actual_provider.name,
            api_key=api_key,
            base_url=kwargs.get("base_url"),
            timeout=kwargs.get("timeout"),
            max_retries=kwargs.get("max_retries", DEFAULT_MAX_RETRIES),
        )
        self.provider = actual_provider
        sensitive_file_upload_protection: bool = kwargs.get(
            "sensitive_file_upload_protection", True
        )
        file_upload_path_deny_segments: t.Optional[t.Sequence[str]] = kwargs.get(
            "file_upload_path_deny_segments"
        )
        self.tools = Tools(
            client=self._client,
            provider=actual_provider,
            file_download_dir=kwargs.get("file_download_dir"),
            toolkit_versions=toolkit_versions,
            auto_upload_download_files=kwargs.get("auto_upload_download_files", True),
            sensitive_file_upload_protection=sensitive_file_upload_protection,
            file_upload_path_deny_segments=file_upload_path_deny_segments,
        )

        self.toolkits = Toolkits(client=self._client)
        self.triggers = Triggers(client=self._client, toolkit_versions=toolkit_versions)
        self.auth_configs = AuthConfigs(client=self._client)
        self.connected_accounts = ConnectedAccounts(client=self._client)
        self.mcp = MCP(client=self._client)

        # experimental API — decorators for custom tools and toolkits
        from composio.core.models.custom_tool import ExperimentalAPI

        self.experimental = ExperimentalAPI()

        # initialize tool router methods
        self.tool_router = ToolRouter(
            client=self._client,
            provider=actual_provider,
            auto_upload_download_files=kwargs.get("auto_upload_download_files", True),
            sensitive_file_upload_protection=sensitive_file_upload_protection,
            file_upload_path_deny_segments=file_upload_path_deny_segments,
        )
        self.create = self.tool_router.create
        self.use = self.tool_router.use

    @property
    def client(self) -> HttpClient:
        return self._client
