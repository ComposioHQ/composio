"""
Host workspace.
"""

import typing as t

from composio.client.enums import Action
from composio.tools.env.base import Shell, Workspace
from composio.tools.env.host.shell import HostShell
from composio.tools.local.handler import LocalClient


class HostWorkspace(Workspace):
    """Host workspace implementation."""

    def _create_shell(self) -> Shell:
        """Create host shell."""
        return HostShell()

    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action in host workspace."""
        return LocalClient().execute_action(
            action=action,
            request_data=request_data,
            metadata={
                **metadata,
                "workspace": self,
            },
        )
