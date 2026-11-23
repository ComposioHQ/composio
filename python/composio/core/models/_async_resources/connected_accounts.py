from __future__ import annotations

import asyncio
import functools
import typing as t
import warnings

import typing_extensions as te
from composio_client import BadRequestError, ConflictError, RateLimitError, omit

from composio import exceptions
from composio.client._async import AsyncHttpClient
from composio.client.types import (
    connected_account_complete_auth_response,
    connected_account_create_params,
    connected_account_patch_params,
    connected_account_patch_response,
    connected_account_refresh_params,
    connected_account_refresh_response,
    connected_account_retrieve_response,
    connected_account_revoke_response,
    link_create_params,
)
from composio.core.models import connected_accounts as sync
from composio.core.models.base import AsyncResource
from composio.core.models.connected_accounts import (
    _INITIAL_POLL_DELAY_SECONDS,
    _MAX_POLL_DELAY_SECONDS,
    _POLL_DELAY_GROWTH,
    _REFRESH_DEPRECATION,
    _REFRESH_VALIDATE_CREDENTIALS_IGNORED,
    _TERMINAL_CONNECTION_STATES,
    _retry_after_seconds,
    logger,
)
from composio.core.models.experimental import ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT


class AsyncConnectionRequest(AsyncResource):
    """Async counterpart to ConnectionRequest."""

    DEFAULT_WAIT_TIMEOUT = 60.0

    def __init__(
        self,
        id: str,
        status: str,
        redirect_url: t.Optional[str],
        client: AsyncHttpClient,
    ):
        super().__init__(client)
        self.id = id
        self.status = status
        self.redirect_url = redirect_url

    async def wait_for_connection(
        self, timeout: t.Optional[float] = None
    ) -> connected_account_retrieve_response.ConnectedAccountRetrieveResponse:
        """Wait for the connection to be established."""
        timeout = self.DEFAULT_WAIT_TIMEOUT if timeout is None else timeout
        timer = asyncio.timeout(max(0.0, timeout))
        poll_delay = _INITIAL_POLL_DELAY_SECONDS
        try:
            async with timer:
                while True:
                    delay = poll_delay
                    try:
                        connection = await self._client.connected_accounts.retrieve(
                            nanoid=self.id
                        )
                    except RateLimitError as error:
                        delay = max(delay, _retry_after_seconds(error))
                    else:
                        self.status = connection.status
                        if self.status == "ACTIVE":
                            return connection
                        if self.status in _TERMINAL_CONNECTION_STATES:
                            raise exceptions.SDKError(
                                message=f"Connection {self.id} entered terminal state {self.status!r} before becoming active"
                            )
                    await asyncio.sleep(delay)
                    poll_delay = min(
                        poll_delay * _POLL_DELAY_GROWTH, _MAX_POLL_DELAY_SECONDS
                    )
        except TimeoutError as error:
            if not timer.expired():
                raise
            raise exceptions.ComposioSDKTimeoutError(
                message=f"Timeout while waiting for connection {self.id} to be active"
            ) from error

    @classmethod
    async def from_id(cls, id: str, client: AsyncHttpClient) -> te.Self:
        return cls(
            id=id,
            status=(await client.connected_accounts.retrieve(nanoid=id)).status,
            redirect_url=None,
            client=client,
        )


class AsyncConnectedAccounts:
    """Async counterpart to ConnectedAccounts."""

    def __init__(self, client: AsyncHttpClient):
        self._client = client
        self.get = self._client.connected_accounts.retrieve
        self.list = self._client.connected_accounts.list
        self.delete = self._client.connected_accounts.delete
        self.update_status = self._client.connected_accounts.update_status
        self.enable = functools.partial(
            self._client.connected_accounts.update_status, enabled=True
        )
        self.disable = functools.partial(
            self._client.connected_accounts.update_status, enabled=False
        )

    @te.deprecated(_REFRESH_DEPRECATION, category=None)
    async def refresh(
        self,
        nanoid: str,
        **params: te.Unpack[
            connected_account_refresh_params.ConnectedAccountRefreshParams
        ],
    ) -> connected_account_refresh_response.ConnectedAccountRefreshResponse:
        """Refresh the credentials of a connected account."""
        warnings.warn(
            _REFRESH_DEPRECATION, exceptions.ComposioDeprecationWarning, stacklevel=2
        )
        forwarded: t.Dict[str, t.Any] = dict(params)
        if forwarded.pop("validate_credentials", None) is not None:
            warnings.warn(
                _REFRESH_VALIDATE_CREDENTIALS_IGNORED,
                exceptions.ComposioDeprecationWarning,
                stacklevel=2,
            )
        return await self._client.connected_accounts.refresh(nanoid, **forwarded)

    async def revoke(
        self, nanoid: str
    ) -> connected_account_revoke_response.ConnectedAccountRevokeResponse:
        """Revoke a connected account's upstream tokens (best effort) and mark
        the connection ``REVOKED``."""
        try:
            return await self._client.connected_accounts.revoke(nanoid)
        except BadRequestError as error:
            raise exceptions.ComposioConnectedAccountRevocationNotSupportedError(
                f"Connected account {nanoid!r} cannot be revoked programmatically: the toolkit does not support token revocation ({error})"
            ) from error
        except ConflictError as error:
            raise exceptions.ComposioConnectedAccountNotRevokableError(
                f"Connected account {nanoid!r} is not in a revokable state ({error})"
            ) from error

    async def complete_auth(
        self, *, user_id: str, session_uri: str
    ) -> connected_account_complete_auth_response.ConnectedAccountCompleteAuthResponse:
        """Complete a deferred OAuth connection once you have verified the
        user's identity."""
        return await self._client.connected_accounts.complete_auth(
            user_id=user_id, session_uri=session_uri
        )

    async def update(
        self,
        nanoid: str,
        *,
        alias: t.Optional[str] = None,
        connection: t.Optional[connected_account_patch_params.Connection] = None,
    ) -> connected_account_patch_response.ConnectedAccountPatchResponse:
        """Update a connected account's alias and/or credentials."""
        return await self._client.connected_accounts.patch(
            nanoid,
            alias=alias if alias is not None else omit,
            connection=connection if connection is not None else omit,
        )

    async def update_acl(
        self,
        nanoid: str,
        *,
        allow_all_users: t.Optional[bool] = None,
        allowed_user_ids: t.Optional[t.List[str]] = None,
        not_allowed_user_ids: t.Optional[t.List[str]] = None,
    ) -> connected_account_patch_response.ConnectedAccountPatchResponse:
        """Update the per-user ACL on a SHARED connected account. Experimental —
        shape may change in future releases."""
        if (
            allow_all_users is None
            and allowed_user_ids is None
            and (not_allowed_user_ids is None)
        ):
            raise exceptions.ValidationError(
                "update_acl requires at least one of allow_all_users, allowed_user_ids, or not_allowed_user_ids"
            )
        acl: t.Dict[str, t.Any] = {}
        if allow_all_users is not None:
            acl["allow_all_users"] = allow_all_users
        if allowed_user_ids is not None:
            acl["allowed_user_ids"] = allowed_user_ids
        if not_allowed_user_ids is not None:
            acl["not_allowed_user_ids"] = not_allowed_user_ids
        try:
            return await self._client.connected_accounts.patch(
                nanoid,
                experimental={
                    "acl_config_for_shared": t.cast(
                        connected_account_patch_params.ExperimentalACLConfigForShared,
                        acl,
                    )
                },
            )
        except BadRequestError as error:
            message = str(error)
            if ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT in message:
                raise exceptions.ComposioAclOnlyForSharedError(message) from error
            raise

    async def initiate(
        self,
        user_id: str,
        auth_config_id: str,
        *,
        callback_url: t.Optional[str] = None,
        allow_multiple: bool = False,
        config: t.Optional[connected_account_create_params.ConnectionState] = None,
        alias: t.Optional[str] = None,
    ) -> AsyncConnectionRequest:
        """Compound function to create a new connected account. This function creates
        a new connected account and returns a connection request."""
        connected_accounts = await self.list(
            user_ids=[user_id], auth_config_ids=[auth_config_id], statuses=["ACTIVE"]
        )
        if connected_accounts.items and not allow_multiple:
            raise exceptions.ComposioMultipleConnectedAccountsError(
                f"Multiple connected accounts found for user {user_id} in auth config {auth_config_id}. Please use the allow_multiple option to allow multiple connected accounts."
            )
        elif connected_accounts.items:
            logger.warning(
                "[Warn:AllowMultiple] Multiple connected accounts found for user %s in auth config %s",
                user_id,
                auth_config_id,
            )
        connection: dict[str, t.Any] = {"user_id": user_id}
        if callback_url is not None:
            connection["callback_url"] = callback_url
        if config is not None:
            connection["state"] = config
        if alias is not None:
            connection["alias"] = alias
        try:
            raw = await self._client.connected_accounts.with_raw_response.create(
                auth_config={"id": auth_config_id},
                connection=t.cast(
                    connected_account_create_params.Connection, connection
                ),
            )
            response = await raw.parse()
            deprecation_header = raw.headers.get("Deprecation")
        except BadRequestError as error:
            message = str(error)
            if (
                "no longer supported" in message
                and "/api/v3/connected_accounts/link" in message
            ):
                raise exceptions.ComposioLegacyConnectedAccountsEndpointRetiredError(
                    message
                ) from error
            raise
        if not sync._legacy_initiate_warning_emitted and deprecation_header:
            sync._legacy_initiate_warning_emitted = True
            warnings.warn(
                "composio.connected_accounts.initiate() will stop working for this auth config on or before 2026-07-03 (see Sunset header on the response). Switch to composio.connected_accounts.link() — same return shape, same allow_multiple semantics. https://docs.composio.dev/docs/changelog/2026/04/24",
                exceptions.ComposioDeprecationWarning,
                stacklevel=2,
            )
        return AsyncConnectionRequest(
            id=response.id,
            status=response.connection_data.val.status,
            redirect_url=getattr(response.connection_data.val, "redirect_url", None),
            client=self._client,
        )

    async def link(
        self,
        user_id: str,
        auth_config_id: str,
        *,
        callback_url: t.Optional[str] = None,
        alias: t.Optional[str] = None,
        allow_multiple: bool = False,
        experimental: t.Optional[link_create_params.Experimental] = None,
    ) -> AsyncConnectionRequest:
        """Create a Composio Connect Link for a user to connect their account to a given auth config."""
        connected_accounts = await self.list(
            user_ids=[user_id], auth_config_ids=[auth_config_id], statuses=["ACTIVE"]
        )
        if connected_accounts.items and not allow_multiple:
            raise exceptions.ComposioMultipleConnectedAccountsError(
                f"Multiple connected accounts found for user {user_id} in auth config {auth_config_id}. Please use the allow_multiple option to allow multiple connected accounts."
            )
        elif connected_accounts.items:
            logger.warning(
                "[Warn:AllowMultiple] Multiple connected accounts found for user %s in auth config %s",
                user_id,
                auth_config_id,
            )
        try:
            response = await self._client.link.create(
                auth_config_id=auth_config_id,
                user_id=user_id,
                callback_url=callback_url if callback_url is not None else omit,
                alias=alias if alias is not None else omit,
                experimental=experimental if experimental is not None else omit,
            )
        except BadRequestError as error:
            message = str(error)
            if ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT in message:
                raise exceptions.ComposioAclOnlyForSharedError(message) from error
            raise
        return AsyncConnectionRequest(
            id=response.connected_account_id,
            status="INITIATED",
            redirect_url=getattr(response, "redirect_url", None),
            client=self._client,
        )

    async def wait_for_connection(
        self, id: str, timeout: t.Optional[float] = None
    ) -> connected_account_retrieve_response.ConnectedAccountRetrieveResponse:
        """Wait for connected account with given ID to be active"""
        return await AsyncConnectionRequest(
            id=id, status="INITIATED", redirect_url=None, client=self._client
        ).wait_for_connection(timeout=timeout)
