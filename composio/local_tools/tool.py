from typing import List

from .action import Action


action_require_workspace_and_history = {
    "WorkspaceStatus": True,
    "SetupWorkspace": True,
    "SetupGithubRepo": True,
    "CreateWorkspaceAction": True,
    "FindFileCmd": True,
    "CreateFileCmd": True,
    "GoToLineNumInOpenFile": True,
    "OpenFile": True,
    "ScrollUp": True,
    "ScrollDown": True,
    "SearchFileCmd": True,
    "SearchDirCmd": True,
    "SetCursors": True,
    "EditFile": True,
    "RunCommandOnWorkspace": True,
}


class Tool:
    @property
    def tool_name(self) -> str:
        return self.__class__.__name__.lower()

    def actions(self) -> List[Action]:
        raise NotImplementedError("This method should be overridden by subclasses.")

    def get_actions_dict(self) -> dict:
        action_objects_dict = {}

        for action_class in self.actions():
            action_instance = action_class()
            if action_require_workspace_and_history.get(action_class.__name__):
                action_instance.set_workspace_and_history(
                    self.get_workspace_factory(), self.get_history_processor()
                )
            action_name = action_instance.get_tool_merged_action_name()
            action_objects_dict[action_name] = action_instance

        return action_objects_dict

    # def triggers(self) -> List[Trigger]:
    #     raise NotImplementedError("This method should be overridden by subclasses.")
