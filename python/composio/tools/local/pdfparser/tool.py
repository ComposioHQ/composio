# tools/local/pdfparser/tool.py
import typing as t
from composio.tools.local.base import Action, Tool
from .actions.extract_text import ExtractText
from .actions.search_text import SearchText

class PDFParser(Tool):
    """
    A local tool for parsing PDF files and performing operations like extracting and searching text.
    """

    def actions(self) -> list[t.Type[Action]]:
        return [ExtractText, SearchText]

    def triggers(self) -> list:
        return []
