import time
from typing import Optional, TYPE_CHECKING
from pydantic import BaseModel, ConfigDict
from composio.sdk.entities.connectedAccount import ConnectedAccount
from composio.sdk.exceptions import TimeoutException

if TYPE_CHECKING:
    from composio.sdk import Composio

class OAuthConnectionRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    connectionStatus: str
    connectedAccountId: str
    redirectUrl: Optional[str] = None

    def __init__(self, sdk_instance: 'Composio', **data):
        """
        Initializes an OAuthConnectionRequest object. This object represents a connection request for an OAuth flow, which will eventually be used to connect a user's account to a Composio app.

        :param sdk_instance: The Composio instance.
        :type sdk_instance: Composio
        :param data: The data to initialize the object with.
        :type data: dict
        """
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def authorize(
        self,
        field_inputs: dict,
        entity_id: str,
        redirect_url: Optional[str] = None, 
    ):
        """
            Authorizes the connection request with the provided field inputs and entity ID.

            Args:
                field_inputs (dict): The field inputs to be used for authorization.
                entity_id (str): The entity ID to be used for authorization.
                redirect_url (Optional[str], optional): The redirect URL to be used for authorization in OAuth flows. Defaults to None.
            Returns:
                bool: True if the authorization is successful, False otherwise.
        """
        connected_account = self.sdk_instance.get_connected_account(self.connectedAccountId)
        response = self.sdk_instance.http_client.post(
            f"v1/connectedAccounts",
            json={
                "integrationId": connected_account.integrationId,
                "data": field_inputs,
                "redirectUri": redirect_url,
                "userUuid": entity_id,
            },
        )
        if response.status_code >= 200 and response.status_code < 300:
            return True
        return False

    def wait_until_active(
        self, timeout=60
    ) -> ConnectedAccount:  # Timeout adjusted to seconds
        start_time = time.time()
        while time.time() - start_time < timeout:
            connection_info = self.sdk_instance.get_connected_account(
                self.connectedAccountId
            )
            if connection_info.status == "ACTIVE":
                return connection_info

            time.sleep(1)

        raise TimeoutException(
            "Connection did not become active within the timeout period."
        )

