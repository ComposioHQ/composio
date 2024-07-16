"""
Host workspace.
"""

import os
import typing as t

import paramiko

from composio.client.enums import Action
from composio.tools.env.base import Shell, Workspace
from composio.tools.env.host.shell import HostShell, SSHShell
from composio.tools.local.handler import LocalClient


LOOPBACK_ADDRESS = "127.0.0.1"
ENV_SSH_USERNAME = "_SSH_USERNAME"
ENV_SSH_PASSWORD = "_SSH_PASSWORD"


def _read_ssh_config(
    username: t.Optional[str] = None,
    password: t.Optional[str] = None,
    hostname: t.Optional[str] = None,
) -> t.Tuple[t.Optional[str], t.Optional[str], str]:
    return (
        username or os.environ.get(ENV_SSH_USERNAME),
        password or os.environ.get(ENV_SSH_PASSWORD),
        hostname or LOOPBACK_ADDRESS,
    )


class HostWorkspace(Workspace):
    """Host workspace implementation."""

    _ssh: t.Optional[paramiko.SSHClient] = None

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        ssh_username: t.Optional[str] = None,
        ssh_password: t.Optional[str] = None,
        ssh_hostname: t.Optional[str] = None,
    ):
        """Initialize host workspace."""
        super().__init__(api_key=api_key, base_url=base_url)
        try:
            self.logger.debug(f"Setting up SSH client for workspace {self.id}")
            self._ssh = paramiko.SSHClient()
            self._ssh.set_missing_host_key_policy(
                policy=paramiko.AutoAddPolicy(),
            )
            ssh_username, ssh_password, ssh_hostname = _read_ssh_config(
                username=ssh_username,
                password=ssh_password,
                hostname=ssh_hostname,
            )
            self._ssh.connect(
                hostname=ssh_hostname or LOOPBACK_ADDRESS,
                username=ssh_username,
                password=ssh_password,
            )
        except paramiko.SSHException as e:
            self._ssh = None
            self.logger.debug(
                f"Setting up SSH client for workspace failed with error: {e}"
            )
            self.logger.debug("Using shell over `subprocess.Popen`")

    def _create_shell(self) -> Shell:
        """Create host shell."""
        if self._ssh is not None:
            return SSHShell(client=self._ssh)
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

    def teardown(self) -> None:
        super().teardown()
        if self._ssh is not None:
            self._ssh.close()
