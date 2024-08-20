import typing as t

from composio.tools.local.base import Action, Tool

from .actions import PdfImageExtractor, PdfTextExtractor


class PdfTool(Tool):
    """
    PDF Tools for LLM
    """

    def actions(self) -> list[t.Type[Action]]:
        return [PdfTextExtractor, PdfImageExtractor]

    def triggers(self) -> list:
        return []
