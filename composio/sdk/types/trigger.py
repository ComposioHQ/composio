from pydantic import BaseModel, Field
from typing import List, Optional

class PydanticRequestSchema(BaseModel):
    title: str = Field(..., description="Title of the webhook configuration")
    type: str = Field(..., description="Type of the request payload")
    properties: dict = Field(..., description="Properties of the webhook configuration")
    required: List[str] = Field(..., description="Required fields for the webhook configuration")
    
class TriggerModel(BaseModel):
    name: str
    display_name: str
    description: str
    # this is the pydantic request schema for webhook config
    payload: PydanticRequestSchema
    # this is the pydantic request schema for the main payload recieved by the webhook
    config: PydanticRequestSchema
    instructions: str
    appId: str
    appKey: str
    logo: str
    appName: str
    count: int
    enabled: bool
