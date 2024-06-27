from abc import abstractmethod, ABC
from pydantic import BaseModel, Field
import typing as t
from composio.local_tools.local_workspace.commons.utils import communicate, process_output


class Command:
    def __init__(self, command: str):
        self.command = command

    def get_cmd_str(self) -> str:
        return self.command


class WorkspaceEnv(BaseModel):
    '''
    state of the workspace environment, will be used to specify
    -- init env for a workspace
    -- set a workspace to some defined env-state
    '''
    env_variables: t.Dict[str, t.Any] = Field(..., description="env-variables needed to set")
    init_scripts: t.List[str] = Field(..., description="init scripts needs to run on the workspace")


class BaseCmdResponse(BaseModel):
    output: t.Any = Field(..., description="response from command")
    return_code: int = Field(..., description="return code from running a command on workspace")


class Workspace(ABC):
    workspace_id: str = None

    @abstractmethod
    def setup(self, env: WorkspaceEnv, **kwargs):
        pass

    @abstractmethod
    def communicate(self, cmd: Command, timeout: int=25) -> BaseCmdResponse:
        pass

    @abstractmethod
    def reset(self):
        pass

    @abstractmethod
    def get_state(self) -> dict:
        pass

    @abstractmethod
    def close(self):
        pass


