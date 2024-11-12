from composio import WorkspaceType, action
from composio_langchain import Action, App, Tag, Trigger

from .toolset import ComposioToolSet as BaseComposioToolSet

class ComposioToolSet(
    BaseComposioToolSet,
    runtime="crewai",
    description_char_limit=1024,
):
    pass

__all__ = (
    "Action",
    "App",
    "Tag",
    "Trigger",
    "WorkspaceType",
    "action",
    "ComposioToolSet",
)
