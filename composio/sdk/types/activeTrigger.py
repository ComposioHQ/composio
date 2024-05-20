from pydantic import BaseModel


class ActiveTriggerModel(BaseModel):
    """The ActiveTriggerModel class.

    :param id: The ID of the active trigger.
    :type id: str
    :param connectionId: The ID of the connection associated with the active trigger.
    :type connectionId: str
    :param triggerName: The name of the trigger associated with the active trigger.
    :type triggerName: str
    :param triggerConfig: The configuration of the trigger associated with the active trigger.
    :type triggerConfig: dict
    """
    id: str
    connectionId: str
    triggerName: str
    triggerConfig: dict