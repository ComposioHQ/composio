from composio.core.local import Tool, Action
from .actions.fetch_summary import FetchSummaryAction

class WikipediaTool(Tool):
    """
    Tool to interact with Wikipedia.
    """

    def actions(self) -> list[Action]:
        return [FetchSummaryAction]

    def triggers(self) -> list:
        return []  
