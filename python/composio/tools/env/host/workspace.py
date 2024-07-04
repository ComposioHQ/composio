"""
Host workspace.
"""

import typing as t

from composio.client.enums import Action
from composio.tools.env.base import Shell, Workspace
from composio.tools.env.host.shell import HostShell


class HostWorkspace(Workspace):
    """Host workspace implementation."""

    def _create_shell(self) -> Shell:
        """Create host shell."""
        return HostShell()

    def execute_action(
        self,
        action_obj: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action in host workspace."""
        return {}
