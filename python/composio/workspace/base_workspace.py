import typing as t
from abc import ABC, abstractmethod
from uuid import uuid4

from pydantic import BaseModel, Field

from composio.workspace.get_logger import get_logger
from composio.workspace.history_processor import HistoryProcessor, history_recorder
from composio.workspace.utils import BaseCmdResponse


T = t.TypeVar("T", str, bytes)

logger = get_logger("workspace")


class Command(BaseModel):
    name: str = Field(..., description="name of the command")
    code: str = Field(..., description="code to run for that command")


class CommandFile(BaseModel, t.Generic[T]):
    datum: T = Field(..., description="file content for the command file")
    cmd_type: str = Field(..., description="command type one of - source_file, script,")
    name: str = Field(..., description="name of the command file on the workspace")


class WorkspaceEnv(BaseModel):
    """
    state of the workspace environment, will be used to specify
    -- init env for a workspace
    -- set a workspace to some defined env-state
    """

    env_variables: t.Dict[str, t.Any] = Field(
        default={}, description="env-variables needed to set"
    )
    init_scripts: t.List[str] = Field(
        default=[], description="init scripts needs to run on the workspace"
    )
    copy_file_to_workspace: t.List[CommandFile] = Field(
        default=[], description="list of command files to copy on workspace"
    )
    commands_to_execute: t.List[str] = Field(
        default=[], description="commands to execute to setup the env"
    )
    setup_cmd: str = Field(default="", description="setup command for the workspace")


class Workspace(ABC):
    workspace_id: str
    history_processor: HistoryProcessor

    def __init__(self):
        self.workspace_id = str(uuid4())
        self.history_processor = HistoryProcessor()

    @abstractmethod
    def setup(self, env: WorkspaceEnv, **kwargs):
        pass

    @abstractmethod
    def communicate(self, cmd: str, timeout: int = 25) -> BaseCmdResponse:
        pass

    @history_recorder()
    def record_history_and_communicate(
        self, cmd: str, timeout: int = 25
    ) -> BaseCmdResponse:
        return self.communicate(cmd, timeout)

    def get_history(self, workspace_id: str, n: int = 10):
        return self.history_processor.get_history(workspace_id, n)

    @abstractmethod
    def reset(self):
        pass

    @abstractmethod
    def get_state(self) -> dict:
        pass

    @abstractmethod
    def get_running_status(self):
        pass

    @abstractmethod
    def close(self):
        pass
