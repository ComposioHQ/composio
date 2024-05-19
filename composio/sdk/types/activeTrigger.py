from pydantic import BaseModel


class ActiveTriggerModel(BaseModel):
    id: str
    connectionId: str
    triggerName: str
    triggerConfig: dict