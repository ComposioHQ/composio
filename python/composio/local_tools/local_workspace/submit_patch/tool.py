import typing as t
from typing import Optional

from composio.core.local import Action, Tool
from composio.local_tools.local_workspace.commons import (
    HistoryProcessor,
    WorkspaceManagerFactory,
)
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.submit_patch.actions import SubmitPatch


logger = get_logger()


class SubmitPatchTool(Tool):
    """
    submit ptach tool to submit generated patch
    """

    workspace_factory: Optional[WorkspaceManagerFactory] = None
    history_processor: Optional[HistoryProcessor] = None

    def actions(self) -> list[t.Type[Action]]:
        return [SubmitPatch]

    def triggers(self) -> list:
        return []

    def set_workspace_factory(self, workspace_factory: WorkspaceManagerFactory):
        self.workspace_factory = workspace_factory

    def get_workspace_factory(self) -> Optional[WorkspaceManagerFactory]:
        return self.workspace_factory

    def set_history_processor(self, history_processor: HistoryProcessor):
        self.history_processor = history_processor

    def get_history_processor(self) -> Optional[HistoryProcessor]:
        return self.history_processor
