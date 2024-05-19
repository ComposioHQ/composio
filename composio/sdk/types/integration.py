from pydantic import BaseModel, Field
from typing import Optional, List

class IntegrationModel(BaseModel):
    id: str = Field(...)
    name: str = Field(...)
    authScheme: str = Field(...)
    authConfig: dict = Field(default_factory=dict)
    createdAt: str = Field(...)
    updatedAt: str = Field(...)
    enabled: bool = Field(...)
    deleted: bool = Field(...)
    appId: str = Field(...)
    defaultConnectorId: Optional[str] = Field(default=None)
    expectedInputFields: List[str] = Field(default_factory=list)
    logo: str = Field(...)
    appName: str = Field(...)
    useComposioAuth: bool = Field(default=False)
