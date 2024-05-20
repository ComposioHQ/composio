from pydantic import BaseModel, Field
from typing import List, Optional

class PydanticRequestSchema(BaseModel):
    title: str = Field(..., description="Title of the webhook configuration")
    type: str = Field(..., description="Type of the request payload")
    properties: dict = Field(..., description="Properties of the webhook configuration")
    required: List[str] = Field(..., description="Required fields for the webhook configuration")
    
class TriggerModel(BaseModel):
    """TriggerModel class represents a trigger in Composio.

    :param name: The name of the trigger.
    :type name: str
    :param display_name: The display name of the trigger.
    :type display_name: str
    :param description: The description of the trigger.
    :type description: str
    :param payload: The payload of the trigger.
    :type payload: PydanticRequestSchema
    :param config: The configuration of the trigger.
    :type config: PydanticRequestSchema
    :param instructions: The instructions of the trigger.
    :type instructions: str
    :param appId: The ID of the app associated with the trigger.
    :type appId: str
    :param appKey: The key of the app associated with the trigger.
    :type appKey: str
    :param logo: The logo of the trigger.
    :type logo: HttpUrl
    :param appName: The name of the app associated with the trigger.
    :type appName: str
    :param count: The number of times the trigger has been triggered.
    :type count: int
    :param enabled: Whether the trigger is enabled.
    :type enabled: bool
    """
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
