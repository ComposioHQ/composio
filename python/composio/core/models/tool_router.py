"""
ToolRouter module for Composio SDK.

This module provides tool routing session management with direct parameter usage,
following Python conventions and avoiding unnecessary data transformations.
"""

from __future__ import annotations

import typing as t
from types import SimpleNamespace

from composio_client.types.tool_router_create_session_params import ConfigToolkit

from composio.client import HttpClient
from composio.core.models.base import Resource
from composio.exceptions import ValidationError

# Data Types


class ToolRouterSession(SimpleNamespace):
    """Tool router session response with both dot notation and dict-style access."""

    def __init__(self, session_id: str, url: str):
        super().__init__(session_id=session_id, url=url)

    def __getitem__(self, key: str) -> str:
        """Support dict-style access like session['url']"""
        return getattr(self, key)

    def __setitem__(self, key: str, value: str) -> None:
        """Support dict-style assignment like session['url'] = 'new_url'"""
        setattr(self, key, value)


class ToolRouter(Resource):
    """
    ToolRouter class for managing tool routing sessions.

    Provides functionality to create sessions that route tools through
    the Composio platform with proper authentication and configuration.
    """

    def __init__(self, client: HttpClient):
        """
        Initialize ToolRouter instance.

        :param client: HTTP client for API calls
        """
        super().__init__(client)

    def create_session(
        self,
        user_id: str,
        toolkits: t.Optional[t.List[t.Union[ConfigToolkit, str]]] = None,
        manually_manage_connections: t.Optional[bool] = None,
    ) -> ToolRouterSession:
        """
        Create a new tool router session for a user.

        :param user_id: The user ID to create the session for
        :param toolkits: List of toolkit configurations (strings or objects)
        :param manually_manage_connections: Whether to manually manage connections
        :return: Tool router session with session_id and url

        Examples:
            >>> # Simple usage with toolkit names
            >>> session = composio.experimental.tool_router.create_session(
            ...     'user_123',
            ...     toolkits=['github', 'slack']
            ... )
            >>>
            >>> # With auth configs
            >>> session = composio.experimental.tool_router.create_session(
            ...     'user_123',
            ...     toolkits=[
            ...         {'toolkit': 'github', 'auth_config': 'ac_123'},
            ...         'hackernews'
            ...     ],
            ...     manually_manage_connections=False
            ... )
            >>>
            >>> # Access session details (both ways work!)
            >>> print(session.session_id)      # Dot notation (preferred)
            >>> print(session['session_id'])   # Dict-style access
            >>> print(session.url)             # Dot notation (preferred)
            >>> print(session['url'])          # Dict-style access
        """
        try:
            # Normalize toolkits to the format expected by the API
            toolkit_configs: t.List[ConfigToolkit] = []
            if toolkits:
                for toolkit in toolkits:
                    if isinstance(toolkit, str):
                        # Convert string to toolkit config
                        toolkit_configs.append(ConfigToolkit(toolkit=toolkit))
                    else:
                        # Already a config object, use as-is
                        toolkit_configs.append(toolkit)

            # Create session using the tool router API
            session = self._client.tool_router.create_session(
                user_id=user_id,
                config={
                    "toolkits": toolkit_configs,
                    "manually_manage_connections": manually_manage_connections,
                },
            )

            # Return the session response directly (no unnecessary transformations)
            return ToolRouterSession(
                session_id=session.session_id, url=session.chat_session_mcp_url
            )

        except Exception as e:
            raise ValidationError(
                f"Failed to create tool router session for user {user_id}"
            ) from e
