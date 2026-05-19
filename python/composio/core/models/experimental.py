"""The ``composio.experimental`` namespace.

Houses experimental SDK surfaces whose shape may change in future
releases. Two flavours live here today:

- Decorators for in-process custom tools and toolkits
  (``composio.experimental.tool`` / ``composio.experimental.Toolkit``).
  Implementation details for these still live in :mod:`custom_tool`;
  this module just exposes them on the namespace.
- Experimental SDK methods that take a Composio client
  (``composio.experimental.update_sharing``).

Anything new on the ``composio.experimental`` namespace should land here,
not on the underlying model modules.
"""

from __future__ import annotations

import typing as t

from pydantic import BaseModel

from composio.client import HttpClient
from composio.client.types import (
    connected_account_patch_params,
    connected_account_patch_response,
)

from .custom_tool import (
    CustomTool,
    ExperimentalToolkit,
    _get_caller_locals,
    _infer_tool_from_function,
)

# API error fragment returned when ACL fields are sent for a connection
# that is not SHARED. Substring-matched in `update_sharing` here and in
# the sibling `link()` / `authorize()` call sites.
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

    def update_sharing(
        self,
        nanoid: str,
        *,
        account_type: t.Optional[t.Literal["PRIVATE", "SHARED"]] = None,
        allow_all_users: t.Optional[bool] = None,
        allowed_user_ids: t.Optional[t.List[str]] = None,
        not_allowed_user_ids: t.Optional[t.List[str]] = None,
    ) -> connected_account_patch_response.ConnectedAccountPatchResponse:
        """
        Update the sharing model and/or per-user ACL of a connected account.
        Experimental — shape may change in future releases.

        Two knobs in one call:

        - ``account_type`` toggles the sharing model:

          * ``"SHARED"`` promotes a PRIVATE connection to SHARED without
            re-auth. Optionally pass ACL fields in the same call to grant
            initial access.
          * ``"PRIVATE"`` demotes a SHARED connection back to PRIVATE.
            Non-creator access is revoked and existing ACL settings are
            cleared. Sending ACL fields in the same call raises
            ``ComposioAclOnlyForSharedError``.

        - ACL fields (``allow_all_users`` / ``allowed_user_ids`` /
          ``not_allowed_user_ids``) edit the per-user grants on a SHARED
          connection. PATCH semantics — omit a field to leave it
          unchanged; pass an empty list to clear an allow/deny list.

        Demotion silently revokes access from everyone the creator
        previously granted. Confirm the action on the frontend (showing
        an explicit "you're about to revoke access from N users" prompt)
        before calling this with ``account_type="PRIVATE"``.

        At least one field must be provided.

        :param nanoid: The connected account ID (``ca_xxx``).
        :param account_type: ``"SHARED"`` to promote (no re-auth needed),
            ``"PRIVATE"`` to demote and clear existing ACL settings. Omit to
            leave the sharing model unchanged.
        :param allow_all_users: When True, any ``user_id`` may use this
            SHARED connection (subject to the deny list).
        :param allowed_user_ids: Explicit list of allowed ``user_id``
            strings. Pass ``[]`` to clear.
        :param not_allowed_user_ids: Explicit deny list (wins over allow
            on conflict). Pass ``[]`` to clear — clearing the deny list
            silently re-grants access to previously-blocked users.
        :return: Response with ``id``, ``status``, and ``success``.

        Examples::

            # Promote a PRIVATE connection to SHARED and grant access in
            # one call (no re-auth).
            composio.experimental.update_sharing(
                'ca_abc',
                account_type='SHARED',
                allow_all_users=True,
                not_allowed_user_ids=['user_bob'],
            )

            # Edit ACL on a connection that's already SHARED.
            composio.experimental.update_sharing(
                'ca_abc',
                allowed_user_ids=['user_alice'],
            )

            # Demote — revokes all non-creator access and clears ACL settings.
            composio.experimental.update_sharing(
                'ca_abc',
                account_type='PRIVATE',
            )
        """
        from composio_client import BadRequestError

        from composio import exceptions

        if self._client is None:
            raise exceptions.ValidationError(
                "update_sharing requires a Composio client. Access it via "
                "composio.experimental.update_sharing(...)."
            )
        if (
            account_type is None
            and allow_all_users is None
            and allowed_user_ids is None
            and not_allowed_user_ids is None
        ):
            raise exceptions.ValidationError(
                "update_sharing requires at least one of account_type, "
                "allow_all_users, allowed_user_ids, or not_allowed_user_ids"
            )

        acl: connected_account_patch_params.ExperimentalACLConfigForShared = {}
        if allow_all_users is not None:
            acl["allow_all_users"] = allow_all_users
        if allowed_user_ids is not None:
            acl["allowed_user_ids"] = allowed_user_ids
        if not_allowed_user_ids is not None:
            acl["not_allowed_user_ids"] = not_allowed_user_ids

        experimental_body: connected_account_patch_params.Experimental = {}
        if account_type is not None:
            experimental_body["account_type"] = account_type
        if acl:
            experimental_body["acl_config_for_shared"] = acl

        try:
            return self._client.connected_accounts.patch(
                nanoid,
                experimental=experimental_body,
            )
        except BadRequestError as error:
            message = str(error)
            if ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT in message:
                raise exceptions.ComposioAclOnlyForSharedError(message) from error
            raise

    def update_acl(
        self,
        nanoid: str,
        *,
        allow_all_users: t.Optional[bool] = None,
        allowed_user_ids: t.Optional[t.List[str]] = None,
        not_allowed_user_ids: t.Optional[t.List[str]] = None,
    ) -> connected_account_patch_response.ConnectedAccountPatchResponse:
        """
        Deprecated compatibility alias for ``update_sharing()``.

        Use ``update_sharing()`` for new code. This alias only accepts the
        ACL fields exposed by the older experimental helper.
        """
        return self.update_sharing(
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
