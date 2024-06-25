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
    ApplyMultipleEditsInFile,
    ApplyMultipleEditsInFileRequest,
)
from composio.local_tools.local_workspace.cmd_manager.actions.get_patch import (
    GetPatchCmd,
    GetPatchRequest,
)
from composio.local_tools.local_workspace.cmd_manager.actions.linter import (
    AutoFlakeLinterRequest,
    AutoflakeLinter,
    Flake8Linter,
    LinterRequest,
    PylintLinter,
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

    def test_multi_edit_cmd(self):
        w = WorkspaceManagerFactory()
        h = HistoryProcessor()
        create_action = CreateWorkspaceAction()
        create_action.set_workspace_and_history(w, h)
        ca_resp = create_action.execute(CreateWorkspaceRequest(), {})
        workspace_id = ca_resp.workspace_id
        git_clone_a = GithubCloneCmd()
        git_clone_a.set_workspace_and_history(w, h)
        git_clone_a.execute(
            GithubCloneRequest(
                workspace_id=workspace_id,
                repo_name="ComposioHQ/composio",
                branch_name="shubhra/linter",
            ),
            {},
        )
        open_file_cmd = OpenFile()
        open_file_cmd.set_workspace_and_history(w, h)
        open_file_cmd.execute(
            OpenCmdRequest(
                workspace_id=workspace_id, file_name="coders/composio_coders/linter.py"
            ),
            {},
        )

        edit_file_cmd = ApplyMultipleEditsInFile()
        edit_file_cmd.set_workspace_and_history(w, h)
        output, return_code = edit_file_cmd.execute(
            ApplyMultipleEditsInFileRequest(
                workspace_id=workspace_id,
                edits=[
                    {
                        "file_name": "coders/composio_coders/linter.py",
                        "start_line": 13,
                        "end_line": 13,
                        "replacement_text": "",
                    },
                    {
                        "file_name": "coders/composio_coders/linter.py",
                        "start_line": 150,
                        "end_line": 150,
                        "replacement_text": "        :",
                    },
                ],
            ),
            {},
        )
        print(output)

    def test_pylinter_cmd(self):
        w = WorkspaceManagerFactory()
        h = HistoryProcessor()
        create_action = CreateWorkspaceAction()
        create_action.set_workspace_and_history(w, h)
        ca_resp = create_action.execute(CreateWorkspaceRequest(), {})
        workspace_id = ca_resp.workspace_id
        git_clone_a = GithubCloneCmd()
        git_clone_a.set_workspace_and_history(w, h)
        git_clone_a.execute(
            GithubCloneRequest(
                workspace_id=workspace_id,
                repo_name="ComposioHQ/composio",
                branch_name="shubhra/linter",
            ),
            {},
        )
        action = PylintLinter()
        action.set_workspace_and_history(w, h)
        result = action.execute(LinterRequest(workspace_id=workspace_id), {})
        print(result)
        self.assertIsNotNone(result)

    def test_flak8linter_cmd(self):
        w = WorkspaceManagerFactory()
        h = HistoryProcessor()
        create_action = CreateWorkspaceAction()
        create_action.set_workspace_and_history(w, h)
        ca_resp = create_action.execute(CreateWorkspaceRequest(), {})
        workspace_id = ca_resp.workspace_id
        git_clone_a = GithubCloneCmd()
        git_clone_a.set_workspace_and_history(w, h)
        git_clone_a.execute(
            GithubCloneRequest(
                workspace_id=workspace_id,
                repo_name="ComposioHQ/composio",
                branch_name="shubhra/linter",
            ),
            {},
        )
        action = Flake8Linter()
        action.set_workspace_and_history(w, h)
        result = action.execute(LinterRequest(workspace_id=workspace_id), {})
        print(result)
        self.assertIsNotNone(result)

    def test_autoflake_cmd(self):
        w = WorkspaceManagerFactory()
        h = HistoryProcessor()
        create_action = CreateWorkspaceAction()
        create_action.set_workspace_and_history(w, h)
        ca_resp = create_action.execute(CreateWorkspaceRequest(), {})
        workspace_id = ca_resp.workspace_id
        git_clone_a = GithubCloneCmd()
        git_clone_a.set_workspace_and_history(w, h)
        git_clone_a.execute(
            GithubCloneRequest(
                workspace_id=workspace_id,
                repo_name="ComposioHQ/composio",
                branch_name="shubhra/linter",
            ),
            {},
        )
        action = AutoflakeLinter()
        action.set_workspace_and_history(w, h)
        result = action.execute(
            AutoFlakeLinterRequest(
                workspace_id=workspace_id,
                file_name="composio/local_tools/local_workspace/cmd_manager/actions/linter.py",
            ),
            {},
        )
        print(result)
        self.assertIsNotNone(result)

    def test_parse_pylint_errors(self):
        out = """GLOB sdist-make: /home/shubhra/work/composio/composio_sdk/setup.py
pylint inst-nodeps: /home/shubhra/work/composio/composio_sdk/.tox/.tmp/package/1/composio_core-0.3.11.zip
pylint installed: aiohttp==3.9.5,aiosignal==1.3.1,annotated-types==0.7.0,anyio==4.4.0,astroid==3.2.2,async-timeout==4.0.3,attrs==23.2.0,beaupy==3.8.2,certifi==2024.6.2,charset-normalizer==3.3.2,click==8.1.7,cloudpickle==3.0.0,composio_core @ file:///home/shubhra/work/composio/composio_sdk/.tox/.tmp/package/1/composio_core-0.3.11.zip#sha256=71c1f52e4343589a76722a33d098ba37d9128b056764e36c6e69c330a6e5db03,dill==0.3.8,distro==1.9.0,docker==7.1.0,docstring_parser==0.16,emoji==2.12.1,exceptiongroup==1.2.1,Farama-Notifications==0.0.4,frozenlist==1.4.1,gymnasium==0.29.1,h11==0.14.0,httpcore==1.0.5,httpx==0.27.0,idna==3.7,importlib_metadata==7.1.0,inflection==0.5.1,isort==5.13.2,jsonref==1.1.0,jsonschema==4.22.0,jsonschema-specifications==2023.12.1,markdown-it-py==3.0.0,mccabe==0.7.0,mdurl==0.1.2,multidict==6.0.5,numpy==1.26.4,openai==1.33.0,platformdirs==4.2.2,pydantic==2.7.3,pydantic_core==2.18.4,Pygments==2.18.0,pylint==3.2.3,pyperclip==1.8.2,python-yakh==0.3.2,PyYAML==6.0.1,questo==0.2.3,referencing==0.35.1,requests==2.32.3,rich==13.7.1,rpds-py==0.18.1,sentry-sdk==2.5.1,simple_parsing==0.1.5,sniffio==1.3.1,termcolor==2.4.0,tomli==2.0.1,tomlkit==0.12.5,tqdm==4.66.4,typing_extensions==4.12.2,urllib3==2.2.1,yarl==1.9.4,zipp==3.19.2
pylint run-test-pre: PYTHONHASHSEED='3789068287'
pylint run-test: commands[0] | pylint -j 2 composio/ tests/ scripts/ coders/
************* Module composio.local_tools.local_workspace.cmd_manager.tool
composio/local_tools/local_workspace/cmd_manager/tool.py:4:0: W0404: Reimport 'GitRepoTree' (imported line 4) (reimported)
************* Module composio.local_tools.local_workspace.cmd_manager.actions.linter
composio/local_tools/local_workspace/cmd_manager/actions/linter.py:140:0: C0305: Trailing newlines (trailing-newlines)
composio/local_tools/local_workspace/cmd_manager/actions/linter.py:18:0: C0413: Import "import re" should be placed at the top of the module (wrong-import-position)
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

------------------------------------------------------------------
Your code has been rated at 9.96/10 (previous run: 9.96/10, +0.00)

ERROR: InvocationError for command /home/shubhra/work/composio/composio_sdk/.tox/pylint/bin/pylint -j 2 composio/ tests/ scripts/ coders/ (exited with code 30)
______________________________________________________________________________________________ summary _______________________________________________________________________________________________
ERROR:   pylint: commands failed
        """
        from pprint import pprint

        from composio.local_tools.local_workspace.cmd_manager.actions.linter import (
            get_errors,
        )

        pprint(get_errors(out))

    def test_mypy_parse_errors(self):
        out = """GLOB sdist-make: /home/shubhra/work/composio/composio_sdk/setup.py
mypy inst-nodeps: /home/shubhra/work/composio/composio_sdk/.tox/.tmp/package/1/composio_core-0.3.11.zip
mypy installed: WARNING: Ignoring invalid distribution -omposio-core (/home/shubhra/work/composio/composio_sdk/.tox/mypy/lib/python3.10/site-packages),aiohttp==3.9.5,aiosignal==1.3.1,annotated-types==0.7.0,anyio==4.4.0,async-timeout==4.0.3,attrs==23.2.0,beaupy==3.8.2,certifi==2024.2.2,charset-normalizer==3.3.2,click==8.1.7,composio_core @ file:///home/shubhra/work/composio/composio_sdk/.tox/.tmp/package/1/composio_core-0.3.11.zip#sha256=dd5a10b37056ef01453c6a320f259ec69c0a9562ebf48148211d55d3ecbdff14,distro==1.9.0,emoji==2.12.1,exceptiongroup==1.2.1,frozenlist==1.4.1,h11==0.14.0,httpcore==1.0.5,httpx==0.27.0,idna==3.7,importlib-metadata==4.13.0,inflection==0.5.1,jsonref==1.1.0,jsonschema==4.22.0,jsonschema-specifications==2023.12.1,markdown-it-py==3.0.0,mdurl==0.1.2,multidict==6.0.5,mypy==1.3.0,mypy-extensions==1.0.0,openai==1.30.4,pydantic==2.7.2,pydantic_core==2.18.3,Pygments==2.18.0,pyperclip==1.8.2,python-yakh==0.3.2,questo==0.2.3,referencing==0.35.1,requests==2.32.2,rich==13.7.1,rpds-py==0.18.1,sniffio==1.3.1,termcolor==2.4.0,tomli==2.0.1,tqdm==4.66.4,typing_extensions==4.12.0,urllib3==2.2.1,yarl==1.9.4,zipp==3.19.0
mypy run-test-pre: PYTHONHASHSEED='1471921678'
mypy run-test: commands[0] | mypy composio/ scripts/ tests/ coders/ --config-file tox.ini
composio/local_tools/local_workspace/tests/test_workspace.py:132: error: expected an indented block after function definition on line 128  [syntax]
Found 1 error in 1 file (errors prevented further checking)
ERROR: InvocationError for command /home/shubhra/work/composio/composio_sdk/.tox/mypy/bin/mypy composio/ scripts/ tests/ coders/ --config-file tox.ini (exited with code 2)
______________________________________________________________________________________________ summary _______________________________________________________________________________________________
ERROR:   mypy: commands failed
        """

        from composio.local_tools.local_workspace.cmd_manager.actions.linter import (
            get_mypy_errors,
        )

        print(get_mypy_errors(out))

    def test_flake8_parse(self):
        out = """GLOB sdist-make: /home/shubhra/work/composio/composio_sdk/setup.py
    flake8 inst-nodeps: /home/shubhra/work/composio/composio_sdk/.tox/.tmp/package/1/composio_core-0.3.11.zip
    flake8 installed: aiohttp==3.9.5,aiosignal==1.3.1,annotated-types==0.7.0,anyio==4.4.0,async-timeout==4.0.3,attrs==23.2.0,beaupy==3.8.2,certifi==2024.2.2,charset-normalizer==3.3.2,click==8.1.7,composio_core @ file:///home/shubhra/work/composio/composio_sdk/.tox/.tmp/package/1/composio_core-0.3.11.zip#sha256=c9b6c53feb53002cc7a5ac4eab433e226ff4c300f60aac9d60707399e00b1f65,distro==1.9.0,emoji==2.12.1,exceptiongroup==1.2.1,flake8==6.0.0,frozenlist==1.4.1,h11==0.14.0,httpcore==1.0.5,httpx==0.27.0,idna==3.7,importlib-metadata==4.13.0,inflection==0.5.1,jsonref==1.1.0,jsonschema==4.22.0,jsonschema-specifications==2023.12.1,markdown-it-py==3.0.0,mccabe==0.7.0,mdurl==0.1.2,multidict==6.0.5,openai==1.30.4,pycodestyle==2.10.0,pydantic==2.7.2,pydantic_core==2.18.3,pyflakes==3.0.1,Pygments==2.18.0,pyperclip==1.8.2,python-yakh==0.3.2,questo==0.2.3,referencing==0.35.1,requests==2.32.2,rich==13.7.1,rpds-py==0.18.1,sniffio==1.3.1,termcolor==2.4.0,tqdm==4.66.4,typing_extensions==4.12.0,urllib3==2.2.1,yarl==1.9.4,zipp==3.19.0
    flake8 run-test-pre: PYTHONHASHSEED='2931598528'
    flake8 run-test: commands[0] | flake8 composio/ scripts/ tests/ coders/ --config tox.ini
    coders/composio_coders/linter.py:13:1: F401 'composio.local_tools.local_workspace.commons.local_docker_workspace.communicate' imported but unused
    coders/composio_coders/linter.py:149:59: E203 whitespace before ':'
    coders/composio_coders/prompts.py:75:98: W292 no newline at end of file
    coders/composio_coders/swe.py:236:9: F841 local variable 'review_task' is assigned to but never used
    composio/local_tools/local_workspace/cmd_manager/actions/clone_github.py:71:12: E111 indentation is not a multiple of 4
    composio/local_tools/local_workspace/cmd_manager/actions/linter.py:1:1: F401 'typing.Optional' imported but unused
    composio/local_tools/local_workspace/cmd_manager/actions/linter.py:18:1: E402 module level import not at top of file
    composio/local_tools/local_workspace/cmd_manager/actions/linter.py:20:1: E302 expected 2 blank lines, found 1
    composio/local_tools/local_workspace/cmd_manager/actions/linter.py:33:1: E302 expected 2 blank lines, found 1
    composio/local_tools/local_workspace/cmd_manager/actions/linter.py:50:1: E302 expected 2 blank lines, found 1
    composio/local_tools/local_workspace/cmd_manager/actions/linter.py:70:1: E302 expected 2 blank lines, found 1
    composio/local_tools/local_workspace/cmd_manager/actions/linter.py:96:36: E222 multiple spaces after operator
    composio/local_tools/local_workspace/cmd_manager/actions/linter.py:121:1: W391 blank line at end of file
    composio/local_tools/local_workspace/cmd_manager/tool.py:4:1: F811 redefinition of unused 'GitRepoTree' from line 4
    composio/local_tools/local_workspace/tests/test_workspace.py:10:1: F401 'composio.local_tools.local_workspace.cmd_manager.actions.linter.BlackLinter' imported but unused
    composio/local_tools/local_workspace/tests/test_workspace.py:10:1: F401 'composio.local_tools.local_workspace.cmd_manager.actions.linter.IsortLinter' imported but unused
    composio/local_tools/local_workspace/tests/test_workspace.py:10:1: F401 'composio.local_tools.local_workspace.cmd_manager.actions.linter.Flake8Linter' imported but unused
    composio/local_tools/local_workspace/tests/test_workspace.py:73:137: E203 whitespace before ','
    composio/local_tools/local_workspace/tests/test_workspace.py:84:201: E501 line too long (1244 > 200 characters)
    composio/local_tools/local_workspace/tests/test_workspace.py:131:201: E501 line too long (1138 > 200 characters)
    composio/local_tools/local_workspace/tests/test_workspace.py:141:9: F401 'pprint.pprint' imported but unused
    ERROR: InvocationError for command /home/shubhra/work/composio/composio_sdk/.tox/flake8/bin/flake8 composio/ scripts/ tests/ coders/ --config tox.ini (exited with code 1)
    ______________________________________________________________________________________________ summary _______________________________________________________________________________________________
    ERROR:   flake8: commands failed
        """
        from pprint import pprint

        from composio.local_tools.local_workspace.cmd_manager.actions.linter import (
            get_flake8_errors,
        )

        pprint(get_flake8_errors(out))


if __name__ == "__main__":
    unittest.main()
