from __future__ import annotations

import typing_extensions as te

from composio.client.types import (
    log_create_tool_execution_params,
    log_create_tool_execution_response,
    log_retrieve_tool_execution_response,
)
from composio.core.models.base import AsyncResource


class AsyncLogs(AsyncResource):
    """Async counterpart to Logs."""

    async def search(
        self,
        **params: te.Unpack[
            log_create_tool_execution_params.LogCreateToolExecutionParams
        ],
    ) -> log_create_tool_execution_response.LogCreateToolExecutionResponse:
        """Search tool execution logs with filters, pagination, and a time range."""
        return await self._client.logs.create_tool_execution(**params)

    async def get(
        self, id: str
    ) -> log_retrieve_tool_execution_response.LogRetrieveToolExecutionResponse:
        """Retrieve a single tool execution log by id."""
        return await self._client.logs.retrieve_tool_execution(id)
