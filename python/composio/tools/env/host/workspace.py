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
from composio.tools.env.base import SessionFactory, Workspace, WorkspaceConfigType
from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.env.filemanager.manager import FileManager
from composio.tools.env.host.shell import HostShell, SSHShell, Shell


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


Shells = SessionFactory[Shell]
Browsers = SessionFactory[BrowserManager]
FileManagers = SessionFactory[FileManager]


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

    _shells: t.Optional[Shells] = None
    _browsers: t.Optional[Browsers] = None
    _filemanagers: t.Optional[FileManagers] = None

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

    def _create_shell(self) -> Shell:
        """Create host shell."""
        if self._ssh is not None:
            return SSHShell(client=self._ssh, environment=self.environment)
        return HostShell()

    @property
    def shells(self) -> Shells:
        """Active shell session."""
        if self._shells is None:
            self._shells = Shells(self._create_shell)
        return self._shells

    def _create_filemanager(self) -> FileManager:
        """Create file manager for the workspace."""
        return FileManager(working_dir=self._working_dir)

    @property
    def filemanagers(self) -> FileManagers:
        """Active file manager session."""
        if self._filemanagers is None:
            self._filemanagers = FileManagers(self._create_filemanager)
        return self._filemanagers

    def _create_browsermanager(self) -> BrowserManager:
        """Create browser manager for the workspace."""
        return BrowserManager()

    @property
    def browsers(self) -> Browsers:
        """Active file manager session."""
        if self._browsers is None:
            self._browsers = Browsers(self._create_browsermanager)
        return self._browsers

    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action in host workspace."""
        from composio.tools.local import (  # pylint: disable=import-outside-toplevel
            load_local_tools,
        )

        registry = load_local_tools()
        tool = (
            registry["runtime"][action.app.upper()]
            if action.is_runtime
            else registry["local"][action.app.upper()]
        )
        return tool.execute(
            action=action.slug,
            params=request_data,
            metadata={
                **metadata,
                "_filemanagers": lambda: self.filemanagers,
                "_browsers": lambda: self.browsers,
                "_shells": lambda: self.shells,
            },
        )

    def teardown(self) -> None:
        """Teardown host workspace."""
        if self._ssh is not None:
            self._ssh.close()

        if self._shells is not None:
            self._shells.teardown()

        if self._browsers is not None:
            self._browsers.teardown()

        if self._filemanagers is not None:
            self._filemanagers.teardown()
