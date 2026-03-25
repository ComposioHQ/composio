"""Session context implementation injected into custom tool execute functions.

One instance is created per session and shared across all custom tool invocations,
including sibling routing (tool A calling tool B without hitting the network).
"""

from __future__ import annotations

import typing as t

from composio_client import omit
from composio_client.types.tool_router.session_proxy_execute_params import Parameter
from composio_client.types.tool_router.session_execute_response import (
    SessionExecuteResponse,
)
from composio_client.types.tool_router.session_proxy_execute_response import (
    SessionProxyExecuteResponse,
)

from composio.client import HttpClient
from composio.core.models.custom_tool_execution import (
    execute_custom_tool,
    find_custom_tool,
)
from composio.core.models.custom_tool_types import CustomToolsMap
from composio.core.models.tools import _serialize_arguments
from composio.exceptions import ValidationError


_VALID_METHODS = frozenset({"GET", "POST", "PUT", "DELETE", "PATCH"})
_VALID_PARAM_TYPES = frozenset({"header", "query"})


def proxy_execute_impl(
    client: HttpClient,
    session_id: str,
    *,
    toolkit: str,
    endpoint: str,
    method: t.Literal["GET", "POST", "PUT", "DELETE", "PATCH"],
    body: t.Any = None,
    parameters: t.Optional[t.List[t.Dict[str, t.Any]]] = None,
) -> SessionProxyExecuteResponse:
    """Shared proxy execute implementation used by SessionContextImpl and ToolRouterSession."""
    # Client-side validation (matches TS SessionProxyExecuteParamsSchema)
    if not toolkit:
        raise ValidationError("proxy_execute: toolkit is required")
    if not endpoint:
        raise ValidationError("proxy_execute: endpoint is required")
    if method not in _VALID_METHODS:
        raise ValidationError(
            f"proxy_execute: method must be one of {sorted(_VALID_METHODS)}, got {method!r}"
        )

    # Transform and validate parameters
    api_params: t.List[Parameter] = []
    if parameters:
        for i, p in enumerate(parameters):
            if not isinstance(p, dict) or "name" not in p or "value" not in p:
                raise ValidationError(
                    f"proxy_execute: parameters[{i}] must be a dict with 'name' and 'value' keys"
                )
            param_type = p.get("in", p.get("type", "header"))
            if param_type not in _VALID_PARAM_TYPES:
                raise ValidationError(
                    f"proxy_execute: parameters[{i}].type must be 'header' or 'query', "
                    f"got {param_type!r}"
                )
            api_params.append(
                Parameter(
                    name=p["name"],
                    type=param_type,  # type: ignore[typeddict-item]
                    value=str(p["value"]),
                )
            )

    return client.tool_router.session.proxy_execute(
        session_id=session_id,
        toolkit_slug=toolkit,
        endpoint=endpoint,
        method=method,
        body=body if body is not None else omit,
        parameters=api_params if api_params else omit,
    )


class SessionContextImpl:
    """Concrete implementation of SessionContext.

    One instance is created per session (singleton) and shared across
    all custom tool invocations. When ``custom_tools_map`` is provided,
    ``execute()`` checks local tools first before falling back to the
    backend API (sibling routing).
    """

    def __init__(
        self,
        client: HttpClient,
        user_id: str,
        session_id: str,
        custom_tools_map: t.Optional[CustomToolsMap] = None,
    ) -> None:
        self._client = client
        self._user_id = user_id
        self._session_id = session_id
        self._custom_tools_map = custom_tools_map

    @property
    def user_id(self) -> str:
        return self._user_id

    def execute(
        self,
        tool_slug: str,
        arguments: t.Dict[str, t.Any],
    ) -> SessionExecuteResponse:
        """Execute any tool from within a custom tool.

        Routes to sibling local tools in-process when available,
        otherwise delegates to the backend API.

        Returns the same response model as ``session.execute()``.
        """
        # Try local tool first (sibling routing)
        entry = find_custom_tool(self._custom_tools_map, tool_slug)
        if entry:
            result = execute_custom_tool(entry, arguments, self)
            return SessionExecuteResponse(
                data=result["data"],
                error=result["error"],
                log_id="",
            )

        # Serialize any Pydantic model instances before sending to remote API
        serialized = _serialize_arguments(arguments)

        # Fall back to remote execution
        return self._client.tool_router.session.execute(
            session_id=self._session_id,
            tool_slug=tool_slug,
            arguments=serialized,
        )

    def proxy_execute(
        self,
        *,
        toolkit: str,
        endpoint: str,
        method: t.Literal["GET", "POST", "PUT", "DELETE", "PATCH"],
        body: t.Any = None,
        parameters: t.Optional[t.List[t.Dict[str, t.Any]]] = None,
    ) -> SessionProxyExecuteResponse:
        """Proxy API calls through Composio's auth layer.

        Returns the same response model as ``session.proxy_execute()``.
        """
        return proxy_execute_impl(
            self._client,
            self._session_id,
            toolkit=toolkit,
            endpoint=endpoint,
            method=method,
            body=body,
            parameters=parameters,
        )
