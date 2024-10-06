import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import AddPDFContentToRagTool, RagPDFQuery


class PDFRagTool(LocalTool, autoload=True):

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [AddPDFContentToRagTool, RagPDFQuery]
