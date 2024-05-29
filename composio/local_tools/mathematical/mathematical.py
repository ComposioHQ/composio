from ..tool import Tool
from .calculator import Calculator


class Mathematical(Tool):
    """
    Mathematical Tools for LLM
    """

    def actions(self) -> list:
        return [Calculator]

    def triggers(self) -> list:
        return []
