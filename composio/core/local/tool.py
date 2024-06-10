from typing import Optional, Type

from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    WorkspaceManagerFactory,
)

from .action import Action


class Tool:
    @property
    def tool_name(self) -> str:
        return self.__class__.__name__.lower()

    def actions(self) -> list[Type[Action]]:
        raise NotImplementedError("This method should be overridden by subclasses.")

    def get_workspace_factory(self) -> Optional[WorkspaceManagerFactory]:
        pass

    def get_history_processor(self) -> Optional[HistoryProcessor]:
        pass

    def get_actions_dict(self) -> dict:
        action_objects_dict = {}

        for action_class in self.actions():
            action_instance = action_class()
            if action_class._history_maintains:  # pylint: disable=protected-access
                action_instance.set_workspace_and_history(  # type: ignore
                    self.get_workspace_factory(), self.get_history_processor()
                )
            action_name = action_instance.get_tool_merged_action_name()
            action_objects_dict[action_name] = action_instance

        return action_objects_dict

    # def triggers(self) -> List[Trigger]:
    #     raise NotImplementedError("This method should be overridden by subclasses.")
