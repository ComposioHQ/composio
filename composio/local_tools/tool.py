from .action import Action
from typing import List


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
            action_name = action_instance.get_tool_merged_action_name()

            action_objects_dict[action_name] = action_instance

        return action_objects_dict

    # def triggers(self) -> List[Trigger]:
    #     raise NotImplementedError("This method should be overridden by subclasses.")
