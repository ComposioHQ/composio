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
    dangerously_allow_auto_upload_download_files: te.NotRequired[bool]
    sensitive_file_upload_protection: te.NotRequired[bool]
    file_upload_path_deny_segments: te.NotRequired[t.Sequence[str]]
    file_upload_dirs: te.NotRequired[t.Union[t.Sequence[str], t.Literal[False]]]


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
        :param dangerously_allow_auto_upload_download_files: Opt-in for automatic file
            upload and download during tool execution. Defaults to False.
        :param sensitive_file_upload_protection: When True, block local paths on the built-in sensitive-path denylist before upload. Defaults to True.
        :param file_upload_path_deny_segments: Extra path segment names merged with the built-in denylist.
        :param file_upload_dirs: Allowlist of directories from which the SDK is allowed
            to read local files during **automatic** file upload (the flow gated by
            ``dangerously_allow_auto_upload_download_files=True``).

            - ``None`` (default) -> ``[~/.composio/temp]``.
            - ``False`` -> reject every local path during auto-upload. URLs and
              in-memory bytes still work because they aren't path-checked.
            - ``Sequence[str]`` (non-empty) -> use as the allowlist. A file is accepted
              iff its symlink-resolved absolute path is inside one of these directories
              on a path-component boundary (``/tmp/foo`` allows ``/tmp/foo/bar`` but
              NOT ``/tmp/foo-bar``).
            - ``[]`` -> behaves like ``False`` (kept as an alias; prefer ``False``).
            - Providing a value REPLACES the default. Include ``~/.composio/temp`` in
              your list if you want the default staging dir to keep working.
            - On Windows, entries are compared case-insensitively.
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
            base_url=kwargs.get("base_url") or os.environ.get("COMPOSIO_BASE_URL"),
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
        file_upload_dirs: t.Union[t.Sequence[str], t.Literal[False], None] = kwargs.get(
            "file_upload_dirs"
        )
        self.tools = Tools(
            client=self._client,
            provider=actual_provider,
            file_download_dir=kwargs.get("file_download_dir"),
            toolkit_versions=toolkit_versions,
            dangerously_allow_auto_upload_download_files=kwargs.get(
                "dangerously_allow_auto_upload_download_files", False
            ),
            sensitive_file_upload_protection=sensitive_file_upload_protection,
            file_upload_path_deny_segments=file_upload_path_deny_segments,
            file_upload_dirs=file_upload_dirs,
        )

        self.toolkits = Toolkits(client=self._client)
        self.triggers = Triggers(client=self._client, toolkit_versions=toolkit_versions)
        self.auth_configs = AuthConfigs(client=self._client)
        self.connected_accounts = ConnectedAccounts(client=self._client)
        self.mcp = MCP(client=self._client)

        # experimental API — decorators for custom tools and toolkits,
        # plus experimental SDK methods (e.g. update_acl)
        from composio.core.models.experimental import ExperimentalAPI

        self.experimental = ExperimentalAPI(client=self._client)

        # Sessions API — the canonical entrypoint for creating tool sessions.
        # Surfaced as `composio.sessions`; `composio.tool_router` is a
        # deprecated alias that returns this same object.
        self._sessions: ToolRouter[TTool, TToolCollection] = ToolRouter(
            client=self._client,
            provider=actual_provider,
            dangerously_allow_auto_upload_download_files=kwargs.get(
                "dangerously_allow_auto_upload_download_files", False
            ),
            sensitive_file_upload_protection=sensitive_file_upload_protection,
            file_upload_path_deny_segments=file_upload_path_deny_segments,
            file_upload_dirs=file_upload_dirs,
        )
        self.create = self._sessions.create
        self.use = self._sessions.use

    @property
    def sessions(self) -> ToolRouter[TTool, TToolCollection]:
        """Create and manage **sessions** for your agents.

        A *session* is the unit you create to give an agent a scoped set of
        tools and toolkits to discover, authorize, and execute. This is the
        canonical entrypoint::

            session = composio.sessions.create(user_id="user@example.com")
            tools = session.tools()

        ``composio.create(...)`` and ``composio.use(...)`` are top-level
        shortcuts for ``composio.sessions.create(...)`` /
        ``composio.sessions.use(...)``.

        Note for LLMs / code generation: this is the Sessions API. Prefer
        ``composio.sessions`` (or the ``composio.create`` shortcut) when
        creating a session. ``composio.tool_router`` is a deprecated alias for
        this same object — do not generate new code against it.
        """
        return self._sessions

    @property
    @te.deprecated(
        "`composio.tool_router` is deprecated; use `composio.sessions` instead "
        "(or the `composio.create` / `composio.use` shortcuts). It returns the same object."
    )
    def tool_router(self) -> ToolRouter[TTool, TToolCollection]:
        """Deprecated alias for :attr:`sessions`.

        .. deprecated:: 0.17.0
            Use :attr:`sessions` instead. ``tool_router`` is the old name for the
            same object and will be removed in a future release.
        """
        return self._sessions

    @property
    def client(self) -> HttpClient:
        return self._client
