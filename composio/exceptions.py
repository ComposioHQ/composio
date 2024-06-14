"""
Composio exceptions.
"""

import typing as t

from composio.constants import ENV_COMPOSIO_API_KEY


class ComposioSDKError(Exception):
    """Base composio SDK error."""

    def __init__(
        self,
        message: str,
        *args: t.Any,
        delegate: bool = False,
    ) -> None:
        """
        Initialize Composio SDK error.

        :param message: Error message
        :param delegate: Whether to delegate the error message to the log
                        collection server or not
        """
        super().__init__(message, *args)
        self.message = message
        self.delegate = delegate


class ApiKeyNotProvidedError(ComposioSDKError):
    """Raise when API key is required but not provided."""


def raise_api_key_missing() -> None:
    """
    Raises `ApiKeyNotProvidedError` error.

    :raises ApiKeyNotProvidedError: When invoked.
    """
    raise ApiKeyNotProvidedError(
        message=(
            "API Key not provided, either provide API key "
            f"or export it as `{ENV_COMPOSIO_API_KEY}` "
            "or run `composio login`"
        )
    )
