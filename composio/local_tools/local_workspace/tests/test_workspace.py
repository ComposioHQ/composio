import unittest

import pytest

from composio.local_tools.local_workspace.cmd_manager.actions.search_cmds import (
    GetCurrentDirCmd,
    GetCurrentDirRequest,
)
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    LocalDockerArgumentsModel,
    WorkspaceManagerFactory,
)
from composio.local_tools.local_workspace.workspace.actions.create_workspace import (
    CreateWorkspaceAction,
    CreateWorkspaceRequest,
)


@pytest.mark.skip(reason="no way of currently testing this in github action")
class TestCreateWorkspaceAction(unittest.TestCase):
    def test_create_workspace(self):
        # Setup - create an instance of CreateWorkspaceAction
        w = WorkspaceManagerFactory()
        h = HistoryProcessor()
        action = CreateWorkspaceAction()
        action.set_workspace_and_history(w, h)

        # Execute the action
        result = action.execute(
            CreateWorkspaceRequest(image_name="sweagent/swe-agent:latest"), {}
        )

        # Verify - Check if the workspace was created successfully
        self.assertIsNotNone(result.workspace_id)


class TestCmds(unittest.TestCase):
    def test_create_dir_cmd(self):
        # Setup - create an instance of CreateWorkspaceAction
        w = WorkspaceManagerFactory()
        h = HistoryProcessor()
        workspace_id = w.get_workspace_manager(
            LocalDockerArgumentsModel(image_name="sweagent/swe-agent:latest")
        )
        action = GetCurrentDirCmd()
        action.set_workspace_and_history(w, h)

        result = action.execute(GetCurrentDirRequest(workspace_id=workspace_id), {})
        self.assertIsNotNone(result)


if __name__ == "__main__":
    unittest.main()
