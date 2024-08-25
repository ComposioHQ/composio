"""Test workspace factory."""

import typing as t

from composio import Action
from composio.tools.base.runtime import action
from composio.tools.env.base import Workspace, WorkspaceConfigType
from composio.tools.env.factory import (
    DockerWorkspace,
    E2BWorkspace,
    FlyIOWorkspace,
    HostWorkspace,
    WorkspaceFactory,
    WorkspaceType,
)


@action(toolname="cow")
def say(message: str) -> str:
    """
    Make cow say.

    :param message: Message string
    :return output: Output string
    """
    return f"Cow says: {message}"


class BaseFactoryTest:
    type: t.Type[Workspace]
    config: WorkspaceConfigType
    workspace: Workspace

    @classmethod
    def setup_class(cls) -> None:
        cls.workspace = WorkspaceFactory.new(config=cls.config)

    def test_init(self) -> None:
        assert isinstance(self.workspace, self.type)

    def test_execute_local(self) -> None:
        response = self.workspace.execute_action(
            action=Action.SHELLTOOL_EXEC_COMMAND,
            request_data={"cmd": "pwd"},
            metadata={},
        )

        assert response["successfull"]
        assert "stdout" in response["data"]
        assert response["data"]["exit_code"] == 0

    def test_execute_runtime(self) -> None:
        response = self.workspace.execute_action(
            action=Action(say),
            request_data={"message": "Hello, World!"},
            metadata={},
        )

        assert response["successfull"]
        assert response["data"]["output"] == "Cow says: Hello, World!"


class TestHost(BaseFactoryTest):
    type = HostWorkspace
    config = WorkspaceType.Host()


class TestDocker(BaseFactoryTest):
    type = DockerWorkspace
    config = WorkspaceType.Docker(image="composio/composio:dev")


class TestE2B(BaseFactoryTest):
    type = E2BWorkspace
    config = WorkspaceType.E2B(template="bg8v5hkbhq1w09i5h65u")


class TestFlyIO(BaseFactoryTest):
    type = FlyIOWorkspace
    config = WorkspaceType.FlyIO(image="composio/composio:dev")
