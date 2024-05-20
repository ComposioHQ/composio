from typing import Optional
from pydantic import BaseModel, ConfigDict

class AuthConnectionParams(BaseModel):
    """The AuthConnectionParams class.

    :param scope: The scope of the connection.
    :type scope: str
    :param base_url: The base URL of the connection.
    :type base_url: str
    :param client_id: The client ID of the connection.
    :type client_id: str
    :param token_type: The token type of the connection.
    :type token_type: str
    :param access_token: The access token of the connection.
    :type access_token: str
    :param client_secret: The client secret of the connection.
    :type client_secret: str
    :param consumer_id: The consumer ID of the connection.
    :type consumer_id: str
    :param consumer_secret: The consumer secret of the connection.
    :type consumer_secret: str
    :param headers: The headers of the connection.
    :type headers: dict
    :param queryParams: The query parameters of the connection.
    :type queryParams: dict
    """
    scope: Optional[str] = None
    base_url: Optional[str] = None
    client_id: Optional[str] = None
    token_type: Optional[str] = None
    access_token: Optional[str] = None
    client_secret: Optional[str] = None
    consumer_id: Optional[str] = None
    consumer_secret: Optional[str] = None
    headers: Optional[dict] = None
    queryParams: Optional[dict] = None

class ConnectedAccountModel(BaseModel):
    """The ConnectedAccountModel class.

    :param model_config: The configuration for the model.
    :type model_config: ConfigDict
    :param integrationId: The ID of the integration.
    :type integrationId: str
    :param connectionParams: The connection parameters.
    :type connectionParams: AuthConnectionParams
    :param appUniqueId: The unique ID of the app.
    :type appUniqueId: str
    :param id: The ID of the connected account.
    :type id: str
    :param status: The status of the connected account.
    :type status: str
    :param createdAt: The creation date of the connected account.
    :type createdAt: str
    :param updatedAt: The last update date of the connected account.
    :type updatedAt: str
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)
    integrationId: str
    connectionParams: AuthConnectionParams
    appUniqueId: str
    id: str
    status: str
    createdAt: str
    updatedAt: str
