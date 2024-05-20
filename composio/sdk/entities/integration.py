from typing import TYPE_CHECKING, Optional

from composio.sdk.entities.connectionRequest import OAuthConnectionRequest
from composio.sdk.types.integration import IntegrationModel

if TYPE_CHECKING:
    from composio.sdk import Composio

class Integration(IntegrationModel):
    def __init__(self, sdk_instance: 'Composio', **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def get_required_variables(self):
        """Get the required variables for the integration to be successfully created.

        :return: A list of required variables for the integration to be successfully created.
        :rtype: list[Any]
        """
        return self.expectedInputFields
    
    def initiate_connection(
        self,
        entity_id: str,
        params: dict = {},
        redirect_url: Optional[str] = None,
    ) -> OAuthConnectionRequest:
        """
        Initiates a oauth connection request to the integration.

        Args:
            entity_id (str): The ID of the entity to connect.
            params (dict, optional): Additional parameters to pass to the integration. Defaults to {}.
            redirect_url (Optional[str], optional): The URL to redirect to after the connection is established. Defaults to None.

        Returns:
            OAuthConnectionRequest: An object representing the connection request.
        """
        resp = self.sdk_instance.http_client.post(
            f"v1/connectedAccounts",
            json={
                "integrationId": self.id,
                "userUuid": entity_id,
                "data": params or {},
                "redirectUri": redirect_url,
            },
        )
        return OAuthConnectionRequest(self.sdk_instance, **resp.json())
