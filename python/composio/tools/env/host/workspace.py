"""
Host workspace.
"""

import os
import subprocess
import sys
import typing as t
from dataclasses import dataclass

import paramiko
import typing_extensions as te
from paramiko.ssh_exception import NoValidConnectionsError, SSHException

from composio.client.enums import Action, ActionType, App, AppType, TagType
from composio.exceptions import ComposioSDKError
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

    _is_ssh_client_set_up: bool

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
        self._is_ssh_client_set_up = False

    def _setup_ssh_client(self) -> None:
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
        self._is_ssh_client_set_up = True

    def _create_shell(self) -> Shell:
        """Create host shell."""
        if not self._is_ssh_client_set_up:
            self._setup_ssh_client()

        if self._ssh is not None:
            return SSHShell(client=self._ssh, environment=self.environment)
        return HostShell(environment=self.environment)

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

    def check_for_missing_dependencies(
        self,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> None:
        from composio.tools.base.abs import (  # pylint: disable=import-outside-toplevel
            action_registry,
            tool_registry,
        )
        from composio.utils.pypi import (  # pylint: disable=import-outside-toplevel
            add_package_to_installed_list,
            check_if_package_is_intalled,
        )

        missing: t.Dict[str, t.Set[str]] = {}
        apps = apps or []
        for app in map(App, apps):
            if not app.is_local:
                continue

            for dependency in tool_registry["local"][app.slug].requires or []:
                if check_if_package_is_intalled(dependency):
                    continue
                if app.slug not in missing:
                    missing[app.slug] = set()
                missing[app.slug].add(dependency)

        actions = actions or []

        def is_action(obj):
            try:
                return hasattr(obj, "app")
            except AttributeError:
                return False

        actions = t.cast(
            t.List[Action], [Action(a) if not is_action(a) else a for a in actions]
        )
        for action in actions:
            if not action.is_local or action.is_runtime:
                continue

            for dependency in action_registry["local"][action.slug].requires or []:
                if check_if_package_is_intalled(dependency):
                    continue
                if action.slug not in missing:
                    missing[action.slug] = set()
                missing[action.slug].add(dependency)

        # TODO: Create CRUD object
        tags = tags or []
        for action in map(Action, action_registry["local"]):
            if not any(tag in action.tags for tag in tags):
                continue
            for dependency in action_registry["local"][action.slug].requires or []:
                if check_if_package_is_intalled(dependency):
                    continue
                if action.slug not in missing:
                    missing[action.slug] = set()
                missing[action.slug].add(dependency)

        if len(missing) == 0:
            return

        self.logger.info("Following apps/actions have missing dependencies")
        for enum, dependencies in missing.items():
            self.logger.info(f"• {enum}: {dependencies}")

        installed = set()
        self.logger.info("Installing dependencies...")
        for dependencies in missing.values():
            for dependency in dependencies:
                if dependency in installed:
                    continue
                args = [
                    sys.executable,
                    "-m",
                    "pip",
                    "install",
                    "--disable-pip-version-check",
                    dependency,
                ]
                if "git+https" in dependency:
                    args.append("--force-reinstall")

                self.logger.info(f"Installing {dependency}")
                output = subprocess.check_output(args=args).decode("utf-8")
                if (
                    "Successfully installed" not in output
                    and "Requirement already satisfied" not in output
                ):
                    raise ComposioSDKError(message=f"Error installing {dependency}")
                installed.add(dependency)
                self.logger.info(f"Installed {dependency}")
                add_package_to_installed_list(name=dependency)

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
            registry["runtime"][action.app]
            if action.is_runtime
            else registry["local"][action.app]
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
