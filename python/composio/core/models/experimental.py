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

from pydantic import BaseModel

from composio.client import HttpClient
from composio.client.types import connected_account_patch_response

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


class ExperimentalAPI:
    """Experimental APIs accessed via ``composio.experimental``.

    Provides decorators for creating custom tools and toolkits that run
    in-process alongside remote Composio tools, plus experimental SDK
    methods whose shape may change in future releases.
    """

    Toolkit = ExperimentalToolkit

    def __init__(self, client: t.Optional[HttpClient] = None) -> None:
        self._client = client

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
