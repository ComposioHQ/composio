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
    Tools,
    Triggers,
)
from composio.core.models.base import allow_tracking
from composio.core.provider import TProvider
from composio.core.provider._openai import OpenAIProvider
from composio.utils.logging import WithLogger

_DEFAULT_PROVIDER = OpenAIProvider()


class SDKConfig(te.TypedDict):
    environment: te.NotRequired[APIEnvironment]
    api_key: te.NotRequired[str]
    base_url: te.NotRequired[str]
    timeout: te.NotRequired[int]
    max_retries: te.NotRequired[int]
    allow_tracking: te.NotRequired[bool]
    file_download_dir: te.NotRequired[str]


class Composio(t.Generic[TProvider], WithLogger):
    """
    Composio SDK for Python.
    """

    tools: Tools[TProvider]

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
        """
        WithLogger.__init__(self)
        api_key = kwargs.get("api_key", os.environ.get("COMPOSIO_API_KEY"))
        if not api_key:
            raise exceptions.ApiKeyNotProvidedError()

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
        )
        self.toolkits = Toolkits(client=self._client)
        self.triggers = Triggers(client=self._client)
        self.auth_configs = AuthConfigs(client=self._client)
        self.connected_accounts = ConnectedAccounts(client=self._client)

    @property
    def client(self):
        return self._client
