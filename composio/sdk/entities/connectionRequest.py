from typing import Optional, TYPE_CHECKING
from pydantic import BaseModel, ConfigDict
from composio.sdk.entities.connectedAccount import ConnectedAccount

if TYPE_CHECKING:
    from composio.sdk import Composio

class OAuthConnectionRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    connectionStatus: str
    connectedAccountId: str
    redirectUrl: Optional[str] = None

    sdk: "Composio"

    def __init__(self, sdk: "Composio", **data):
        super().__init__(**data)
        self.sdk = sdk

    def save_user_access_data(
        self, field_inputs: dict, redirect_url: str = None, entity_id: str = None
    ):
        connected_accounts = self.sdk.get_connected_accounts([self.connectedAccountId])

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

