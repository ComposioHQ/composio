import unittest

from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    WorkspaceManagerFactory,
)
from composio.local_tools.local_workspace.workspace.actions.create_workspace import (
    CreateWorkspaceAction,
    CreateWorkspaceRequest,
)


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


if __name__ == "__main__":
    unittest.main()
