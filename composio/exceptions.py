"""
Composio exceptions.
"""

import typing as t


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
