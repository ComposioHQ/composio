from __future__ import annotations

from composio.client.types import keyring_list_transfer_keys_response
from composio.core.models.base import AsyncResource


class AsyncKeyring(AsyncResource):
    """Async counterpart to Keyring."""

    async def list_transfer_keys(
        self,
    ) -> keyring_list_transfer_keys_response.KeyringListTransferKeysResponse:
        """List the public transfer keys of the organization's active customer
        keyring, the keys a secret is sealed to before it is sent to Composio."""
        return await self._client.keyring.list_transfer_keys()
