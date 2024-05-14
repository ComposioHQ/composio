from typing import Optional
from pydantic import BaseModel, ConfigDict

class AuthConnectionParams(BaseModel):
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
    model_config = ConfigDict(arbitrary_types_allowed=True)
    integrationId: str
    connectionParams: AuthConnectionParams
    appUniqueId: str
    id: str
    status: str
    createdAt: str
    updatedAt: str
