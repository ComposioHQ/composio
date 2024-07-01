import os
import unittest

import pytest

from composio.local_tools.local_workspace.cmd_manager.actions.cmds import (
    OpenCmdRequest,
    OpenFile,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    LocalDockerArgumentsModel,
    WorkspaceManagerFactory,
)
from composio.local_tools.local_workspace.edit_cmds.actions.edit_cmd import (
    EditFile,
    EditFileRequest,
)
from composio.local_tools.local_workspace.find_cmds.actions.search_cmds import (
    GetCurrentDirCmd,
    GetCurrentDirRequest,
)
from composio.local_tools.local_workspace.git_cmds.actions.clone_github import (
    GithubCloneCmd,
    GithubCloneRequest,
)
from composio.local_tools.local_workspace.git_cmds.actions.get_patch import (
    GetPatchCmd,
    GetPatchRequest,
)
from composio.workspace.workspace_factory import WorkspaceFactory, WorkspaceType


@pytest.mark.skipif(
    condition=os.environ.get("CI") is not None,
    reason="no way of currently testing this in github action",
)
class TestWorkspaceGitWorkflow(unittest.TestCase):
    def test_git_workflow(self):
        # Setup - create an instance of CreateWorkspaceAction
        workspace_id = WorkspaceFactory.get_instance().create_workspace(
            workspace_type=WorkspaceType.DOCKER,
            local_docker_args=LocalDockerArgumentsModel(
                image_name="sweagent/swe-agent"
            ),
        )

        action = GithubCloneCmd()
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
        open_file_result = action.execute(
            OpenCmdRequest(
                file_name="README.md",
                workspace_id=workspace_id,
            ),
            {},
        )
        self.assertIsNotNone(open_file_result)
        print("Open File result: ", open_file_result)

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
        workspace_id = w.get_workspace_manager(
            LocalDockerArgumentsModel(image_name="sweagent/swe-agent:latest")
        )
        action = GetCurrentDirCmd()

        result = action.execute(GetCurrentDirRequest(workspace_id=workspace_id), {})
        self.assertIsNotNone(result)


if __name__ == "__main__":
    unittest.main()
