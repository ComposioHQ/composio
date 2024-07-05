"""Tool for executing shell commands."""

import typing as t

from composio.tools.local.base.action import Action
from composio.tools.local.base.tool import Tool
from composio.tools.local.shelltool.shell_exec.actions.exec import ExecCommand
from composio.tools.local.shelltool.shell_exec.actions.new import CreateShell


class ShellExec(Tool):
    """Tool for executing shell commands."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Returns list of actions."""
        return [ExecCommand, CreateShell]

    def triggers(self) -> t.List:
        """Returns list of triggers."""
        return []
