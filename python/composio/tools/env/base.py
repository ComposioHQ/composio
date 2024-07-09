import threading
import typing as t
from abc import ABC, abstractmethod

from composio.client.enums import Action
from composio.exceptions import ComposioSDKError
from composio.tools.env.id import generate_id
from composio.utils.logging import WithLogger


class Shell(ABC, WithLogger):
    """Abstract shell session."""

    _id: str

    def sanitize_command(self, cmd: str) -> bytes:
        """Prepare command string."""
        return (cmd.rstrip() + "\n").encode()

    def __str__(self) -> str:
        """String representation."""
        return f"Shell(type={self.__class__.__name__}, id={self.id})"

    __repr__ = __str__

    @property
    def id(self) -> str:
        """Get shell ID."""
        return self._id

    @abstractmethod
    def setup(self) -> None:
        """Setup shell."""

    @abstractmethod
    def exec(self, cmd: str) -> t.Dict:
        """Execute command on container."""

    @abstractmethod
    def stop(self) -> None:
        """Stop and remove the running shell."""


class ShellFactory(WithLogger):
    """Shell factory."""

    _recent: t.Optional[Shell] = None
    _shells: t.Dict[str, Shell] = {}
    _lock: threading.Lock = threading.Lock()

    def __init__(self, factory: t.Callable[[], Shell]) -> None:
        """Creatte shell factory"""
        super().__init__()
        self._factory = factory

    @property
    def recent(self) -> Shell:
        """Get most recent workspace."""
        with self._lock:
            shell = self._recent
        if shell is None:
            shell = self.new()
            with self._lock:
                self._recent = shell
        return shell

    @recent.setter
    def recent(self, shell: Shell) -> None:
        """Get most recent workspace."""
        with self._lock:
            self._recent = shell

    def new(self) -> Shell:
        """Create a new shell."""
        shell = self._factory()
        shell.setup()
        self._shells[shell.id] = shell
        self.recent = shell
        return shell

    def get(self, id: t.Optional[str] = None) -> Shell:
        """Get shell instance."""
        if id is None or id == "":
            return self.recent
        if id not in self._shells:
            raise ComposioSDKError(
                message=f"No shell found with ID: {id}",
            )
        shell = self._shells[id]
        self.recent = shell
        return shell

    def exec(self, cmd: str, id: t.Optional[str] = None) -> t.Dict:
        """Execute a command on shell."""
        return self.get(id=id).exec(cmd=cmd)

    def stop(self, id: str) -> None:
        """Stop shell with given ID."""
        if id not in self._shells:
            return
        shell = self._shells.pop(id)
        shell.stop()

    def teardown(self) -> None:
        """Stop all running shells."""
        while len(self._shells) > 0:
            id, *_ = list(self._shells.keys())
            self._shells.pop(id).stop()
            self.logger.debug(f"Stopped shell with ID: {id}")
        self._recent = None


class Workspace(WithLogger, ABC):
    """Workspace abstraction for executing tools."""

    _shell_factory: t.Optional[ShellFactory] = None

    def __init__(self):
        """Initialize workspace."""
        super().__init__()
        self.id = generate_id()

    def __str__(self) -> str:
        """String representation."""
        return f"Workspace(type={self.__class__.__name__}, id={self.id})"

    __repr__ = __str__

    @property
    def shells(self) -> ShellFactory:
        """Returns shell factory for current workspace."""
        if self._shell_factory is None:
            self._shell_factory = ShellFactory(
                factory=self._create_shell,
            )
        return self._shell_factory

    @abstractmethod
    def _create_shell(self) -> Shell:
        """Create shell."""

    @abstractmethod
    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute an action in this workspace."""

    def teardown(self) -> None:
        """Teardown current workspace."""
        self.shells.teardown()
