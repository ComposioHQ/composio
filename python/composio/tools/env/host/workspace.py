"""
Host workspace.
"""

import os
import typing as t
from dataclasses import dataclass

import paramiko
import typing_extensions as te
from paramiko.ssh_exception import NoValidConnectionsError, SSHException

from composio.client.enums import Action
from composio.tools.env.base import Shell, Workspace, WorkspaceConfigType
from composio.tools.env.filemanager.manager import FileManager
from composio.tools.env.browsermanager.manager import BrowserManager
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


class SSHConfig(te.TypedDict):
    """SSH configuration for creating interactive shell sessions."""

    username: te.NotRequired[str]
    """Username for SSH connection"""

    password: te.NotRequired[str]
    """Password for SSH connection"""

    hostname: te.NotRequired[str]
    """Host for SSH connection"""


@dataclass
class Config(WorkspaceConfigType):
    """Host configuration type."""

    ssh: t.Optional[SSHConfig] = None
    """SSH configuration for creating interactive shell sessions."""


class HostWorkspace(Workspace):
    """Host workspace implementation."""

    _ssh: t.Optional[paramiko.SSHClient] = None

    def __init__(self, config: Config):
        """Initialize host workspace."""
        super().__init__(config=config)
        self.ssh_config = config.ssh or {}
        # TODO: Make this configurable
        self._working_dir = None

        self.ports = []
        self.host = "localhost"

    def setup(self) -> None:
        """Setup workspace."""
        try:
            self.logger.debug(f"Setting up SSH client for workspace {self.id}")
            self._ssh = paramiko.SSHClient()
            self._ssh.set_missing_host_key_policy(
                policy=paramiko.AutoAddPolicy(),
            )
            ssh_username, ssh_password, ssh_hostname = _read_ssh_config(
                username=self.ssh_config.get("username"),
                password=self.ssh_config.get("password"),
                hostname=self.ssh_config.get("hostname"),
            )
            self._ssh.connect(
                hostname=ssh_hostname or LOOPBACK_ADDRESS,
                username=ssh_username,
                password=ssh_password,
            )
        except (SSHException, NoValidConnectionsError) as e:
            self.logger.debug(
                f"Setting up SSH client for workspace failed with error: {e}"
            )
            self.logger.debug("Using shell over `subprocess.Popen`")
            self._ssh = None

    _file_manager: t.Optional[FileManager] = None
    _browser_manager: t.Optional[BrowserManager] = None

    @property
    def file_manager(self) -> FileManager:
        """File manager for the workspace."""
        if self._file_manager is None:
            self._file_manager = FileManager(working_dir=self._working_dir)
        return self._file_manager

    @property
    def browser_manager(self) -> BrowserManager:
        """Browser manager for the workspace."""
        if self._browser_manager is None:
            self._browser_manager = BrowserManager()
        return self._browser_manager

    def _create_shell(self) -> Shell:
        """Create host shell."""
        if self._ssh is not None:
            return SSHShell(
                client=self._ssh,
                environment=self.environment,
            )
        return HostShell()

    def _create_file_manager(self) -> FileManager:
        """Create file manager for the workspace."""
        return FileManager(working_dir=self._working_dir)

    def _create_browser_manager(self) -> BrowserManager:
        """Create browser manager for the workspace."""
        return BrowserManager()

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
            metadata={**metadata, "workspace": self},
        )

    def teardown(self) -> None:
        super().teardown()
        if self._ssh is not None:
            self._ssh.close()
        if self._browser_manager is not None:
            self._browser_manager.cleanup()
