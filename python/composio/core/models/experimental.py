"""The ``composio.experimental`` namespace.

Houses experimental SDK surfaces whose shape may change in future
releases. Two flavours live here today:

- Decorators for in-process custom tools and toolkits
  (``composio.experimental.tool`` / ``composio.experimental.Toolkit``).
  Implementation details for these still live in :mod:`custom_tool`;
  this module just exposes them on the namespace.
- Experimental SDK methods that take a Composio client
  (``composio.experimental.update_acl``).

Anything new on the ``composio.experimental`` namespace should land here,
not on the underlying model modules.
"""

from __future__ import annotations

import typing as t

import typing_extensions as te
from pydantic import BaseModel

from composio.client import HttpClient
from composio.utils.pydantic import none_to_omit
from composio.client.types import (
    connected_account_patch_response,
    custom_delete_toolkit_response,
    custom_sync_response,
    custom_upsert_params,
    custom_upsert_response,
    usage_retrieve_params,
    usage_retrieve_response,
    usage_retrieve_summary_params,
    usage_retrieve_summary_response,
)

from .custom_tool import (
    CustomTool,
    ExperimentalToolkit,
    _get_caller_locals,
    _infer_tool_from_function,
)

# Server-side 400 message the API uses to reject ACL writes against a
# PRIVATE connection. Substring-matched in `update_acl` here and in the
# sibling `link()` / `authorize()` call sites — kept as a single constant
# so a server-side message tweak only requires one edit.
ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT = "acl_config_for_shared is only valid on SHARED"


class ExperimentalUsage:
    """Project usage metering, accessed via ``composio.experimental.usage``.

    Experimental — the response shape may change in future releases. Scoped
    to the project the API key belongs to.
    """

    def __init__(self, client: t.Optional[HttpClient] = None) -> None:
        self._client = client

    def _require_client(self) -> HttpClient:
        from composio import exceptions

        if self._client is None:
            raise exceptions.ValidationError(
                "experimental.usage requires a Composio client. Access it via "
                "composio.experimental.usage.summary(...)."
            )
        return self._client

    def summary(
        self,
        **params: te.Unpack[usage_retrieve_summary_params.UsageRetrieveSummaryParams],
    ) -> usage_retrieve_summary_response.UsageRetrieveSummaryResponse:
        """
        Fetch a usage summary for the project. Experimental — shape may change.

        :param from_: Start of the window (Unix epoch milliseconds).
        :param to: End of the window (Unix epoch milliseconds).
        :param entity_types: Restrict the summary to these entity types.
        :param filters: Additional server-side filters.
        :return: Usage totals keyed by entity type under ``.entities``.

        Example:
            summary = composio.experimental.usage.summary(
                entity_types=["tool_calls"],
            )
        """
        return self._require_client().project.usage.retrieve_summary(**params)

    def breakdown(
        self,
        entity_type: str,
        **params: te.Unpack[usage_retrieve_params.UsageRetrieveParams],
    ) -> usage_retrieve_response.UsageRetrieveResponse:
        """
        Fetch a grouped usage breakdown for one entity type. Experimental —
        shape may change.

        :param entity_type: The metered entity type, e.g. ``tool_calls`` or ``sessions``.
        :param from_: Start of the window (Unix epoch milliseconds).
        :param to: End of the window (Unix epoch milliseconds).
        :param group_by: Field to group the breakdown by (API default: ``tool_slug``
            for ``tool_calls``, ``user_id`` for ``sessions``).
        :param order_by: Sort key (``key``, ``total_quantity`` or ``event_count``).
        :param order_direction: ``asc`` or ``desc``.
        :param limit: Maximum number of groups to return.
        :param filters: Additional server-side filters.
        :return: The usage totals and per-group breakdown.

        Example:
            breakdown = composio.experimental.usage.breakdown(
                "tool_calls",
                group_by="tool_slug",
            )
        """
        return self._require_client().project.usage.retrieve(entity_type, **params)


class ExperimentalCustomToolkits:
    """Project-owned custom toolkits, accessed via
    ``composio.experimental.custom_toolkits``.

    Experimental — custom toolkits are in pilot and the shape may change.
    These toolkits are registered in your Composio project from your own app
    or MCP server, with their own auth configs and connected accounts. They
    are unrelated to the in-process toolkits built with
    ``composio.experimental.Toolkit``.
    """

    def __init__(self, client: t.Optional[HttpClient] = None) -> None:
        self._client = client

    def _require_client(self) -> HttpClient:
        from composio import exceptions

        if self._client is None:
            raise exceptions.ValidationError(
                "experimental.custom_toolkits requires a Composio client. Access "
                "it via composio.experimental.custom_toolkits.upsert(...)."
            )
        return self._client

    def upsert(
        self,
        **params: te.Unpack[custom_upsert_params.CustomUpsertParams],
    ) -> custom_upsert_response.CustomUpsertResponse:
        """
        Create a custom toolkit, or update its display metadata (name, API key
        field copy) when the project already owns one with this slug.
        Experimental — shape may change.

        ``app_url`` and ``auth_schemes`` cannot change on an existing
        toolkit: re-sending them unchanged is a no-op, and changing them fails
        with a 409. Delete and re-register the toolkit instead, which revokes
        its connections.

        :param slug: Letters, digits, underscores or spaces (max 30). The API
            prefixes it with ``CUSTOM_`` and turns spaces into underscores.
        :param toolkit_config: ``name``, ``app_url`` (the MCP URL for MCP
            apps), ``auth_schemes`` and an optional base64 ``logo_file``.
        :return: The toolkit's ``slug``.

        Example:
            composio.experimental.custom_toolkits.upsert(
                slug="INTERNAL_API",
                toolkit_config={
                    "name": "Internal API",
                    "app_url": "https://mcp.internal.example.com/mcp",
                    "auth_schemes": [
                        {
                            "mode": "API_KEY",
                            "headers": {"Authorization": "Bearer {{generic_api_key}}"},
                        }
                    ],
                },
            )
        """
        return self._require_client().custom.upsert(**params)

    def sync(
        self, slug: str, *, connected_account_id: t.Optional[str] = None
    ) -> custom_sync_response.CustomSyncResponse:
        """
        Re-fetch a custom toolkit's tool definitions from its remote MCP
        server. Call it when automatic sync fails or the remote tools change.
        Experimental — shape may change.

        :param slug: The custom toolkit slug (``CUSTOM_...``).
        :param connected_account_id: Connected account to use when fetching
            the remote tool definitions.
        :return: The toolkit ``version`` and ``synced_count``.

        Example:
            result = composio.experimental.custom_toolkits.sync("CUSTOM_MY_TOOLKIT")
            print(result.synced_count)
        """
        return self._require_client().custom.sync(
            slug=slug, connected_account_id=none_to_omit(connected_account_id)
        )

    def delete(
        self, slug: str
    ) -> custom_delete_toolkit_response.CustomDeleteToolkitResponse:
        """
        Delete a custom toolkit owned by the project, with its tools, auth
        configs and connected accounts. The credentials behind those
        connected accounts are revoked in background jobs
        (``revoke_job_ids``). Composio-managed toolkits cannot be deleted
        (API 403). Experimental — shape may change.

        :param slug: The custom toolkit slug (``CUSTOM_...``).
        :return: What was deleted.

        Example:
            composio.experimental.custom_toolkits.delete("CUSTOM_MY_TOOLKIT")
        """
        return self._require_client().custom.delete_toolkit(slug)


class ExperimentalAPI:
    """Experimental APIs accessed via ``composio.experimental``.

    Provides decorators for creating custom tools and toolkits that run
    in-process alongside remote Composio tools, plus experimental SDK
    methods whose shape may change in future releases.
    """

    Toolkit = ExperimentalToolkit

    usage: ExperimentalUsage
    """Project usage metering. Experimental — shape may change."""

    custom_toolkits: ExperimentalCustomToolkits
    """Project-owned custom toolkits. Experimental — shape may change."""

    def __init__(self, client: t.Optional[HttpClient] = None) -> None:
        self._client = client
        self.usage = ExperimentalUsage(client=client)
        self.custom_toolkits = ExperimentalCustomToolkits(client=client)

    def update_acl(
        self,
        nanoid: str,
        *,
        allow_all_users: t.Optional[bool] = None,
        allowed_user_ids: t.Optional[t.List[str]] = None,
        not_allowed_user_ids: t.Optional[t.List[str]] = None,
    ) -> connected_account_patch_response.ConnectedAccountPatchResponse:
        """
        Update the per-user ACL on a SHARED connected account. Experimental —
        shape may change in future releases.

        Only valid on SHARED connections; raises
        ``ComposioAclOnlyForSharedError`` on a PRIVATE connection. Omit a
        parameter to leave it unchanged; pass an empty list to clear an
        allow/deny list. At least one parameter must be provided.

        :param nanoid: The connected account ID (``ca_xxx``).
        :param allow_all_users: When True, any ``user_id`` may use this
            SHARED connection (subject to the deny list).
        :param allowed_user_ids: Explicit list of allowed ``user_id`` strings.
            Pass ``[]`` to clear.
        :param not_allowed_user_ids: Explicit deny list (wins over allow on
            conflict). Pass ``[]`` to clear — note that clearing the deny
            list silently re-grants access to previously-blocked users.
        :return: Response with ``id``, ``status``, and ``success``.

        .. deprecated::
            Use :meth:`composio.connected_accounts.update_acl` instead — ACL
            updates graduated onto the ``connected_accounts`` model. This
            experimental alias is kept only for backwards compatibility and
            delegates to it. Prefer the ``connected_accounts`` model; do not
            generate new code against this alias.

        Example:
            composio.connected_accounts.update_acl(
                'ca_abc',
                allow_all_users=True,
                not_allowed_user_ids=['user_bob'],
            )
        """
        from composio import exceptions

        from .connected_accounts import ConnectedAccounts

        if self._client is None:
            raise exceptions.ValidationError(
                "update_acl requires a Composio client. Access it via "
                "composio.connected_accounts.update_acl(...)."
            )

        return ConnectedAccounts(client=self._client).update_acl(
            nanoid,
            allow_all_users=allow_all_users,
            allowed_user_ids=allowed_user_ids,
            not_allowed_user_ids=not_allowed_user_ids,
        )

    @t.overload
    def tool(self, fn: t.Callable[..., t.Any], /) -> CustomTool: ...

    @t.overload
    def tool(
        self,
        *,
        slug: t.Optional[str] = None,
        name: t.Optional[str] = None,
        description: t.Optional[str] = None,
        extends_toolkit: t.Optional[str] = None,
        output_params: t.Optional[t.Type[BaseModel]] = None,
        preload: t.Optional[bool] = None,
    ) -> t.Callable[[t.Callable[..., t.Any]], CustomTool]: ...

    def tool(
        self,
        fn: t.Optional[t.Callable[..., t.Any]] = None,
        *,
        slug: t.Optional[str] = None,
        name: t.Optional[str] = None,
        description: t.Optional[str] = None,
        extends_toolkit: t.Optional[str] = None,
        output_params: t.Optional[t.Type[BaseModel]] = None,
        preload: t.Optional[bool] = None,
    ) -> t.Union[CustomTool, t.Callable[[t.Callable[..., t.Any]], CustomTool]]:
        """Decorator to create a custom tool from a function.

        Infers slug, name, description, and input_params from the function.
        Override any with explicit keyword arguments.

        Examples::

            # Bare decorator — no parens
            @composio.experimental.tool
            def grep(input: GrepInput, ctx):
                \"\"\"Search for a pattern.\"\"\"
                return {"matches": []}

            # With parens — no args
            @composio.experimental.tool()
            def grep(input: GrepInput, ctx):
                \"\"\"Search for a pattern.\"\"\"
                return {"matches": []}

            # With extends_toolkit — inherits auth
            @composio.experimental.tool(extends_toolkit="gmail")
            def create_draft(input: DraftInput, ctx):
                \"\"\"Create a Gmail draft.\"\"\"
                return ctx.proxy_execute(toolkit="gmail", ...)
        """

        def decorator(f: t.Callable[..., t.Any]) -> CustomTool:
            annotation_locals = _get_caller_locals()
            return _infer_tool_from_function(
                f,
                slug=slug,
                name=name,
                description=description,
                extends_toolkit=extends_toolkit,
                output_params=output_params,
                preload=preload,
                annotation_locals=annotation_locals,
            )

        if fn is not None:
            return _infer_tool_from_function(
                fn,
                slug=slug,
                name=name,
                description=description,
                extends_toolkit=extends_toolkit,
                output_params=output_params,
                preload=preload,
                annotation_locals=_get_caller_locals(),
            )
        return decorator
