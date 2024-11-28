import typing as t

from composio.tools.base.local import LocalAction, LocalTool
from composio.tools.local.anthropic_computer_use.actions.bash import BashCommand
from composio.tools.local.anthropic_computer_use.actions.computer import Computer
from composio.tools.local.anthropic_computer_use.actions.text_editor import TextEditor


class Anthropic(LocalTool, autoload=True):

    requires = ["pyautogui"]
    logo = "https://upload.wikimedia.org/wikipedia/commons/1/14/Anthropic.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        return [BashCommand, Computer, TextEditor]
