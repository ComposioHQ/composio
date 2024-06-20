"""
Local account storage helpers.
"""

import typing as t

from composio.storage.base import LocalStorage


class UserData(LocalStorage):
    """
    Local user data storage.
    """

    api_key: t.Optional[str] = None
    """
    API key for Composio API server
    """
