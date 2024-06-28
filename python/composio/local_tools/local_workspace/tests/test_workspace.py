import os
import unittest

import pytest

from composio.local_tools.local_workspace.cmd_manager.actions.clone_github import (
    GithubCloneCmd,
    GithubCloneRequest,
)
from composio.local_tools.local_workspace.cmd_manager.actions.cmds import (
    OpenCmdRequest,
    OpenFile,
)
from composio.local_tools.local_workspace.cmd_manager.actions.edit_cmd import (
    EditFile,
    EditFileRequest,
)
from composio.local_tools.local_workspace.cmd_manager.actions.get_patch import (
    GetPatchCmd,
    GetPatchRequest,
)
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


@pytest.mark.skipif(
    condition=os.environ.get("CI") is not None,
    reason="no way of currently testing this in github action",
)
class TestWorkspaceGitWorkflow(unittest.TestCase):
    def test_git_workflow(self):
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
        workspace_id = result.workspace_id

        action = GithubCloneCmd()
        action.set_workspace_and_history(w, h)
        github_clone_result = action.execute(
            GithubCloneRequest(
                repo_name="kaavee315/ML_assignment",
                workspace_id=workspace_id,
                commit_id="",
                just_reset=False,
            ),
            {},
        )
        self.assertIsNotNone(github_clone_result)

        action = GithubCloneCmd()
        action.set_workspace_and_history(w, h)
        github_clone_result = action.execute(
            GithubCloneRequest(
                repo_name="kaavee315/ML_assignment",
                workspace_id=workspace_id,
                commit_id="",
                just_reset=False,
            ),
            {},
        )
        self.assertIsNotNone(github_clone_result)

        action = OpenFile()
        action.set_workspace_and_history(w, h)
        open_file_result = action.execute(
            OpenCmdRequest(
                file_name="README.md",
                workspace_id=workspace_id,
            ),
            {},
        )
        self.assertIsNotNone(open_file_result)
        print("Open File 1 result: ", open_file_result)

        action = EditFile()
        action.set_workspace_and_history(w, h)
        edit_file_result = action.execute(
            EditFileRequest(
                start_line=1,
                end_line=1,
                replacement_text="print('Hello, World!')",
                workspace_id=workspace_id,
            ),
            {},
        )
        self.assertIsNotNone(edit_file_result)
        print("Edit File result: ", edit_file_result)

        action = OpenFile()
        action.set_workspace_and_history(w, h)
        open_file_result = action.execute(
            OpenCmdRequest(
                file_name="README.md",
                workspace_id=workspace_id,
            ),
            {},
        )
        self.assertIsNotNone(open_file_result)
        print("Open File 2 result: ", open_file_result)

        action = GetPatchCmd()
        action.set_workspace_and_history(w, h)
        get_patch_result = action.execute(
            GetPatchRequest(
                workspace_id=workspace_id,
            ),
            {},
        )
        self.assertIsNotNone(get_patch_result)
        self.assertIsInstance(get_patch_result, tuple)
        self.assertIsInstance(tuple(get_patch_result)[0], tuple)
        patch_content = (
            tuple(tuple(get_patch_result)[0])[1]
            if isinstance(tuple(tuple(get_patch_result)[0])[1], str)
            else str(tuple(tuple(get_patch_result)[0])[1])
        )
        self.assertIn("Hello", patch_content)
        self.assertIn("README", patch_content)
        self.assertIn("diff", patch_content)

        action = GithubCloneCmd()
        action.set_workspace_and_history(w, h)
        github_reset_result = action.execute(
            GithubCloneRequest(
                repo_name="kaavee315/ML_assignment",
                workspace_id=workspace_id,
                commit_id="",
                just_reset=True,
            ),
            {},
        )
        print("Github Reset result: ", github_reset_result)
        self.assertIsNotNone(github_reset_result)

        action = OpenFile()
        action.set_workspace_and_history(w, h)
        open_file_result = action.execute(
            OpenCmdRequest(
                file_name="README.md",
                workspace_id=workspace_id,
            ),
            {},
        )
        self.assertIsNotNone(open_file_result)
        print("Open File result: ", open_file_result)

        print(h.get_history(workspace_id))

        # Check that the file content doesn't contain "Hello, World!"
        self.assertNotIn("Hello", open_file_result)


@pytest.mark.skipif(
    condition=os.environ.get("CI") is not None,
    reason="no way of currently testing this in github action",
)
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
