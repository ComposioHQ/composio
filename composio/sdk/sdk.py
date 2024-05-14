from typing import Optional
from composio.sdk.http_client import HttpClient
from composio.sdk.storage import get_base_url
from composio.sdk.utils import build_query_params, build_query_url
from composio.sdk.entities.connectedAccount import ConnectedAccount
from composio.sdk.enums import App

class Composio:
    def __init__(self, api_key: str, base_url=get_base_url()):
        """
            Initialize a Composio client with the given API key and base URL.
            Args:
                api_key (str): The API key to use for authentication.
                base_url (str): The base URL to use for API requests. Defaults to the default Composio base URL.
        """
        self.base_url = base_url
        self.api_key = api_key
        self.http_client = HttpClient(base_url)
        self.http_client.headers.update(
            {"Content-Type": "application/json", "x-api-key": self.api_key}
        )

    def list_connected_accounts(
        self, entity_id: Optional[str] = None, showActiveOnly: Optional[bool] = None 
    ) -> list[ConnectedAccount]:
        """
            Get connected accounts for a given entity.
            Args:
                entity_id (Optional[str]): The ID of the entity to get connected accounts for. If not provided, all connected accounts will be returned.
                showActiveOnly (Optional[bool]): Whether to show only active accounts. Defaults to None.
            Returns:
                list[ConnectedAccount]: A list of ConnectedAccount objects.
        """
        
        query_params = build_query_params(entity_id=entity_id, showActiveOnly=showActiveOnly)
        url = build_query_url("v1/connectedAccounts", query_params)

        resp = self.http_client.get(url)
        return [ConnectedAccount(self, **item) for item in resp.json()["items"]]
    
    def get_connected_account(self, connection_id: str) -> ConnectedAccount:
        """
            Get a specific connected account by its ID.
            Args:
                connection_id (str): The ID of the connected account to get.
            Returns:
                ConnectedAccount: A ConnectedAccount object representing the specified connected account.
        """
        resp = self.http_client.get(f"v1/connectedAccounts/{connection_id}")
        return ConnectedAccount(self, **resp.json())
    
    def create_integration(self, app: App,  name: str, use_default_credentials: bool = False) -> Integration:
        pass