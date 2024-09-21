import typing as t

from .action import Action


class Tool:
    """Abstraction for local tools."""

    @property
    def name(self) -> str:
        """Tool name."""
        return self.__class__.__name__.lower()

    def get_action(self, name: str) -> Action:
        """Get action object."""
        for action in self.actions():
            instance = action()
            if instance.get_tool_merged_action_name() != name:
                continue
            return instance
        raise ValueError(f"No action found with name `{name}`")

    def actions(self) -> t.List[t.Type[Action]]:
        raise NotImplementedError("This method should be overridden by subclasses.")

    def triggers(self) -> t.List:
        raise NotImplementedError("This method should be overridden by subclasses.")
