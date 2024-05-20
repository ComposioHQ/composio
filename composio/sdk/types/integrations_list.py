from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Dict

class IntegrationCount(BaseModel):
    connections: int

class ListIntegrationItemModel(BaseModel):
    """
    The ListIntegrationItemModel class represents an item in a list of integrations.
    """
    id: str
    name: str
    authScheme: str
    createdAt: str
    updatedAt: str
    enabled: bool
    deleted: bool
    appId: str
    defaultConnectorId: str
    _count: IntegrationCount
    connections: List[Dict[str, str]]
    appName: str
    logo: HttpUrl

class ListIntegrationsModel(BaseModel):
    """
    The ListIntegrationsModel class represents a list of integrations in Composio.
    """
    items: List[ListIntegrationItemModel]
    totalPages: int
    page: int
