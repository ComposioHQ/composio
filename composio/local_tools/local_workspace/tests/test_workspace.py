import os
import unittest

import pytest

from composio.local_tools.local_workspace.cmd_manager.actions.search_cmds import (
    GetCurrentDirCmd,
    GetCurrentDirRequest,
)
from composio.local_tools.local_workspace.cmd_manager.actions.linter import PylintLinter, LinterRequest, BlackLinter, IsortLinter, Flake8Linter
from composio.local_tools.local_workspace.cmd_manager.actions.clone_github import GithubCloneCmd, GithubCloneRequest
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

    def test_linter_cmd(self):
        w = WorkspaceManagerFactory()
        h = HistoryProcessor()
        create_action = CreateWorkspaceAction()
        create_action.set_workspace_and_history(w, h)
        ca_resp = create_action.execute(CreateWorkspaceRequest(), {})
        workspace_id = ca_resp.workspace_id
        git_clone_a = GithubCloneCmd()
        git_clone_a.set_workspace_and_history(w, h)
        git_clone_a.execute(GithubCloneRequest(workspace_id=workspace_id, repo_name="ComposioHQ/composio", branch_name="shubhra/linter") ,{})
        action = PylintLinter()
        action.set_workspace_and_history(w, h)

        result = action.execute(LinterRequest(workspace_id=workspace_id), {})
        print(result)
        self.assertIsNotNone(result)

    def test_get_errors(self):
        out = '''pylint: install_deps> python -I -m pip install pylint==3.2.3
.pkg: install_requires> python -I -m pip install 'setuptools>=40.8.0' wheel
.pkg: _optional_hooks> python /root/miniconda3/lib/python3.9/site-packages/pyproject_api/_backend.py True setuptools.build_meta __legacy__
.pkg: get_requires_for_build_sdist> python /root/miniconda3/lib/python3.9/site-packages/pyproject_api/_backend.py True setuptools.build_meta __legacy__
.pkg: get_requires_for_build_wheel> python /root/miniconda3/lib/python3.9/site-packages/pyproject_api/_backend.py True setuptools.build_meta __legacy__
.pkg: install_requires_for_build_wheel> python -I -m pip install wheel
.pkg: prepare_metadata_for_build_wheel> python /root/miniconda3/lib/python3.9/site-packages/pyproject_api/_backend.py True setuptools.build_meta __legacy__
.pkg: build_sdist> python /root/miniconda3/lib/python3.9/site-packages/pyproject_api/_backend.py True setuptools.build_meta __legacy__
pylint: install_package_deps> python -I -m pip install aiohttp 'beaupy<4,>=3.7.2' click 'docker>=7.1.0' 'gymnasium>=0.29.1' 'importlib-metadata>=4.8.1' 'inflection>=0.5.1' 'jsonref>=1.1.0' 'jsonschema<5,>=4.21.1' 'openai>=1.3.0' 'pydantic<3,>=2.6.4' 'pyperclip<2,>=1.8.2' 'pyyaml>=6.0.1' 'requests<3,>=2.31.0' 'rich<14,>=13.7.1' 'sentry-sdk>=2.0.0' 'simple-parsing>=0.1.5' 'termcolor<3,>=2.4.0'
pylint: install_package> python -I -m pip install --force-reinstall --no-deps /composio/.tox/.tmp/package/1/composio_core-0.3.11.tar.gz
pylint: commands[0]> pylint -j 2 composio/ tests/ scripts/ coders/
************* Module composio.local_tools.local_workspace.cmd_manager.tool
composio/local_tools/local_workspace/cmd_manager/tool.py:4:0: W0404: Reimport 'GitRepoTree' (imported line 4) (reimported)
************* Module composio.local_tools.local_workspace.cmd_manager.actions.linter
composio/local_tools/local_workspace/cmd_manager/actions/linter.py:85:0: C0305: Trailing newlines (trailing-newlines)
composio/local_tools/local_workspace/cmd_manager/actions/linter.py:1:0: W0611: Unused Optional imported from typing (unused-import)
************* Module composio.local_tools.local_workspace.cmd_manager.actions.clone_github
composio/local_tools/local_workspace/cmd_manager/actions/clone_github.py:71:0: W0311: Bad indentation. Found 11 spaces, expected 12 (bad-indentation)
************* Module coders.composio_coders.linter
coders/composio_coders/linter.py:26:25: R1735: Consider using '{"python": self.py_lint}' instead of a call to 'dict'. (use-dict-literal)
coders/composio_coders/linter.py:39:8: R1705: Unnecessary "else" after "return", remove the "else" and de-indent the code inside it (no-else-return)
coders/composio_coders/linter.py:44:4: R1710: Either all return statements in a function should return an expression, or none of them should. (inconsistent-return-statements)
coders/composio_coders/linter.py:48:18: R1732: Consider using 'with' for resource-allocating operations (consider-using-with)
coders/composio_coders/linter.py:44:38: W0613: Unused argument 'code' (unused-argument)
coders/composio_coders/linter.py:63:12: W0612: Unused variable 'filename' (unused-variable)
coders/composio_coders/linter.py:68:4: R1710: Either all return statements in a function should return an expression, or none of them should. (inconsistent-return-statements)
coders/composio_coders/linter.py:100:4: R1710: Either all return statements in a function should return an expression, or none of them should. (inconsistent-return-statements)
coders/composio_coders/linter.py:137:34: E1101: Instance of 'Exception' has no 'lineno' member (no-member)
coders/composio_coders/linter.py:137:50: E1101: Instance of 'Exception' has no 'end_lineno' member (no-member)
coders/composio_coders/linter.py:144:8: C0200: Consider using enumerate instead of iterating with range and len (consider-using-enumerate)
coders/composio_coders/linter.py:132:0: R1710: Either all return statements in a function should return an expression, or none of them should. (inconsistent-return-statements)
coders/composio_coders/linter.py:155:0: R1710: Either all return statements in a function should return an expression, or none of them should. (inconsistent-return-statements)
coders/composio_coders/linter.py:13:0: W0611: Unused communicate imported from composio.local_tools.local_workspace.commons.local_docker_workspace (unused-import)
************* Module coders.composio_coders.swe
coders/composio_coders/swe.py:177:8: W1203: Use lazy % formatting in logging functions (logging-fstring-interpolation)
coders/composio_coders/swe.py:196:8: W1203: Use lazy % formatting in logging functions (logging-fstring-interpolation)
coders/composio_coders/swe.py:236:8: W0612: Unused variable 'review_task' (unused-variable)
************* Module coders.composio_coders.prompts
coders/composio_coders/prompts.py:75:0: C0304: Final newline missing (missing-final-newline)

-----------------------------------
Your code has been rated at 9.96/10

pylint: exit 30 (22.47 seconds) /composio> pylint -j 2 composio/ tests/ scripts/ coders/ pid=2695
.pkg: _exit> python /root/miniconda3/lib/python3.9/site-packages/pyproject_api/_backend.py True setuptools.build_meta __legacy__
  pylint: FAIL code 30 (47.70=setup[25.23]+cmd[22.47] seconds)
  evaluation failed :( (47.83 seconds)
        '''
        from composio.local_tools.local_workspace.cmd_manager.actions.linter import get_errors
        from pprint import pprint
        get_errors(output=out)


if __name__ == "__main__":
    unittest.main()
