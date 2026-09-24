"""
Logs module for the Composio SDK.

Exposes ``composio.logs`` for searching and retrieving tool execution logs.
"""

from __future__ import annotations

import typing_extensions as te

from composio.client.types import (
    log_create_tool_execution_params,
    log_create_tool_execution_response,
    log_retrieve_tool_execution_response,
)
from composio.core.models.base import Resource


class Logs(Resource):
    """Search and retrieve tool execution logs."""

    def search(
        self,
        **params: te.Unpack[
            log_create_tool_execution_params.LogCreateToolExecutionParams
        ],
    ) -> log_create_tool_execution_response.LogCreateToolExecutionResponse:
        """
        Search tool execution logs with filters, pagination, and a time range.

        Despite the underlying ``POST`` verb this is a read-only search.

        :param limit: Maximum number of logs to return.
        :param cursor: Pagination cursor from a previous response.
        :param filters: Filter clauses to narrow the search.
        :param time_range: Time window to search within.
        :return: Matching logs plus a ``next_cursor`` for pagination.

        Example:
            page = composio.logs.search(
                limit=20,
                filters=[
                    {"field": "toolkit_slug", "operator": "==", "value": "github"}
                ],
            )
            for log in page.logs:
                print(log.id)
        """
        return self._client.logs.create_tool_execution(**params)

    def get(
        self, id: str
    ) -> log_retrieve_tool_execution_response.LogRetrieveToolExecutionResponse:
        """
        Retrieve a single tool execution log by id.

        :param id: The log id.
        :return: The full log entry.

        Example:
            log = composio.logs.get("log_123")
        """
        return self._client.logs.retrieve_tool_execution(id)
