"""
Http client exceptions.
"""

import typing as t

from composio.exceptions import ComposioSDKError


class HTTPError(ComposioSDKError):
    """
    Exception class for HTTP API errors.
    """

    def __init__(
        self,
        message: str,
        status_code: int,
        *args: t.Any,
        delegate: bool = False,
    ) -> None:
        """
        Initialize HTTPError class.

        :param message: Content from the API response
        :param status_code: HTTP response status code
        :param delegate: Whether to delegate the error message to the log
                        collection server or not
        """
        super().__init__(message, *args, delegate=delegate)
        self.status_code = status_code


class ComposioClientError(ComposioSDKError):
    """
    Exception class for Composio client errors.
    """


class NoItemsFound(ComposioClientError):
    """
    Exception class for empty collection values.
    """
