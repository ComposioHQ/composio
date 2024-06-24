from composio.core.local import Tool, Action
from .actions import CreateVectorstore, QueryVectorstore # Import your action class

class EmbedTool(Tool): 
    """
    This tool is useful in embedding images and finding images with text
    """

    def actions(self) -> list[Action]:
        return [CreateVectorstore, QueryVectorstore]

    def triggers(self) -> list:
        return []


