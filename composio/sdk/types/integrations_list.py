from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Dict

class IntegrationCount(BaseModel):
    connections: int

class ListIntegrationItemModel(BaseModel):
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
    items: List[ListIntegrationItemModel]
    totalPages: int
    page: int
