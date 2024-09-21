from composio import WorkspaceType

from composio_langchain import Action, App
from composio_langchain import ComposioToolSet as Base
from composio_langchain import Tag, Trigger


class ComposioToolSet(
    Base,
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
    "ComposioToolSet",
)
