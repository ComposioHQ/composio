"""Test workspace factory."""

import typing as t

from composio import Action
from composio.tools.env.base import Workspace, WorkspaceConfigType
from composio.tools.env.factory import (
    DockerWorkspace,
    E2BWorkspace,
    FlyIOWorkspace,
    HostWorkspace,
    WorkspaceFactory,
    WorkspaceType,
)

from tests.conftest import E2E
from tests.data.custom_tools import say


@E2E
class BaseFactoryTest:
    type: t.Type[Workspace]
    config: WorkspaceConfigType
    workspace: Workspace

    @classmethod
    def setup_class(cls) -> None:
        cls.workspace = WorkspaceFactory.new(config=cls.config)

    @classmethod
    def teardown_class(cls) -> None:
        cls.workspace.teardown()

    def test_init(self) -> None:
        assert isinstance(self.workspace, self.type)

    def test_execute_local(self) -> None:
        response = self.workspace.execute_action(
            action=Action.SHELLTOOL_EXEC_COMMAND,
            request_data={"cmd": "pwd"},
            metadata={},
        )

        assert response.get("successful", response.get("successfull"))
        assert "stdout" in response["data"]
        assert response["data"]["exit_code"] == 0

    def test_execute_runtime(self) -> None:
        response = self.workspace.execute_action(
            action=Action(say),
            request_data={"message": "Hello, World!"},
            metadata={},
        )

        assert response.get("successful", response.get("successfull"))
        assert response["data"]["output"] == "Cow says: Hello, World!"


class TestHost(BaseFactoryTest):
    type = HostWorkspace
    config = WorkspaceType.Host()


class TestDocker(BaseFactoryTest):
    type = DockerWorkspace
    config = WorkspaceType.Docker(image="composio/composio:dev")


class TestE2B(BaseFactoryTest):
    # If this test is failing make sure `Dockerfile.dev` is up to date and run `make e2b-dev`
    type = E2BWorkspace
    config = WorkspaceType.E2B(template="bg8v5hkbhq1w09i5h65u")


class TestFlyIO(BaseFactoryTest):
    # If this test is failing make sure `Dockerfile.dev` is up to date and run `make publish-dev`
    type = FlyIOWorkspace
    config = WorkspaceType.FlyIO(image="composio/composio:dev")
