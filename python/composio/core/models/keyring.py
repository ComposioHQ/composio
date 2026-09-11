"""
Keyring module for the Composio SDK.

Exposes ``composio.keyring`` for the organization's customer-managed keyring.
"""

from __future__ import annotations

from composio.client.types import keyring_list_transfer_keys_response
from composio.core.models.base import Resource


class Keyring(Resource):
    """The organization's customer-managed keyring."""

    def list_transfer_keys(
        self,
    ) -> keyring_list_transfer_keys_response.KeyringListTransferKeysResponse:
        """
        List the public transfer keys of the organization's active customer
        keyring, the keys a secret is sealed to before it is sent to Composio.

        Seal new secrets to the key whose ``kid`` is ``active_kid``: a JWE
        with ``RSA-OAEP-256`` key management, ``A256GCM`` content
        encryption, and the ``kid`` in the protected header. Older keys stay
        listed so values sealed to them remain openable. The API answers 404
        when the organization has no ACTIVE keyring instance.

        :return: ``active_kid`` and every accepted public JWK under ``keys``,
            newest first.

        Example:
            transfer_keys = composio.keyring.list_transfer_keys()
            jwk = next(
                key for key in transfer_keys.keys
                if key.kid == transfer_keys.active_kid
            )
        """
        return self._client.keyring.list_transfer_keys()
