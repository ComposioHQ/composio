"""Test workspace tools."""

import os
import tempfile
from pathlib import Path

import pytest

from composio import Action, ComposioToolSet
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.env.factory import WorkspaceType
from composio.utils.logging import get as get_logger


PATH = Path(__file__).parent


def test_outputs() -> None:
    """Test outputs."""
    toolset = ComposioToolSet(
        workspace_config=WorkspaceType.Host(),
    )
    output = toolset.execute_action(
        action=Action.SHELL_EXEC_COMMAND,
        params={"cmd": f"ls {PATH}"},
    )
    assert output[EXIT_CODE] == 0
    assert output[STDERR] == ""
    assert "test_workspace.py" in output[STDOUT]


def test_stderr() -> None:
    """Test outputs."""
    toolset = ComposioToolSet(
        workspace_config=WorkspaceType.Host(),
    )
    output = toolset.execute_action(
        action=Action.SHELL_EXEC_COMMAND,
        params={"cmd": "ls ./random"},
    )
    assert "No such file or directory" in output[STDERR]


def _check_output(output: dict) -> None:
    """Check tool output."""
    assert output[EXIT_CODE] == 0, f"output: {output}"


# def test_docker_workspace() -> None:
#     """Test docker workspace."""
#     workspace = WorkspaceFactory.new(config=WorkspaceType.Docker())
#     logger = get_logger()

#     start_time = time.time()
#     toolset = ComposioToolSet(workspace_id=workspace.id)
#     end_time = time.time()
#     print(
#         f"Time taken to initialize ComposioToolSet: {end_time - start_time:.4f} seconds"
#     )
#     output = toolset.execute_action(
#         action=Action.SHELL_EXEC_COMMAND,
#         params={"cmd": "ls"},
#     )
#     output = toolset.execute_action(
#         action=Action.FILETOOL_OPEN_FILE,
#         params={"file_name": "git_repo_tree.txt"},
#     )
#     logger.info("output of open git repo tree:", output)
#     output = toolset.execute_action(
#         action=Action.SEARCHTOOL_SEARCH_DIR_CMD,
#         params={"search_term": "FILE_UPLOAD_PERMISSION", "directory": "django/conf"},
#     )
#     logger.info(f"output of search dir: {output}")
#     output = toolset.execute_action(
#         action=Action.FILEEDITTOOL_OPEN_FILE,
#         params={"file_name": "django/conf/global_settings.py"},
#     )
#     _check_output(output=output)
#     logger.info(f"output of open global settings: {output}")
#     logger.info(f"output of search dir: {output}")
#     output = toolset.execute_action(
#         action=Action.FILEEDITTOOL_OPEN_FILE,
#         params={"file_name": "django/conf/global_settings.py", "line_number": 50},
#     )
#     _check_output(output=output)
#     logger.info(f"output of open global settings: {output}")
#     logger.info(f"output of search dir: {output}")
#     output = toolset.execute_action(
#         action=Action.FILEEDITTOOL_OPEN_FILE,
#         params={"file_name": "django/conf/global_settings.py", "line_number": 100},
#     )
#     _check_output(output=output)
#     logger.info(f"output of open global settings: {output}")
#     assert False


@pytest.skip("skipping")
def test_workspace() -> None:
    """Test workspace tools."""
    tempdir = tempfile.TemporaryDirectory()  # pylint: disable=consider-using-with
    cwd = Path.cwd()
    allow_clone_without_repo = os.environ.get("ALLOW_CLONE_WITHOUT_REPO")
    os.environ["ALLOW_CLONE_WITHOUT_REPO"] = "true"
    os.chdir(tempdir.name)
    logger = get_logger()
    try:
        toolset = ComposioToolSet(
            workspace_config=WorkspaceType.Host(),
        )
        # output = toolset.execute_action(
        #     action=Action.FILETOOL_EDIT_FILE,
        #     params={"file_path": "/Users/karanvaidya/codes/composio_sdk/python/swe/examples/crewai_agent/compiler.py", "start_line": 19, "end_line": 19, "text": "FORCE = object() #added data"},
        # )
        output = toolset.execute_action(
            action=Action.FILETOOL_EDIT_FILE,
            params={
                "file_path": "/Users/karanvaidya/codes/composio_sdk/python/global_settings.py",
                "start_line": 307,
                "end_line": 307,
                "text": "FILE_UPLOAD_PERMISSIONS = 0o644\nabc",
            },
        )
        logger.info(f"output of edit file: {output}")
        assert False
        _check_output(
            output=toolset.execute_action(
                action=Action.SHELL_EXEC_COMMAND,
                params={"cmd": f"cd {tempdir.name}"},
            )
        )

        assert toolset.execute_action(
            action=Action.FILETOOL_GIT_CLONE,
            params={"repo_name": "ComposioHQ/composio"},
        ).get("success")

        output = toolset.execute_action(
            action=Action.FILEEDITTOOL_OPEN_FILE,
            params={"file_name": "random_file.txt"},
        )
        logger.info("output of open wrong file", output)
        output_open_file = toolset.execute_action(
            action=Action.FILETOOL_OPEN_FILE,
            params={"file_path": "python/composio/client/enums/_action.py"},
        )
        logger.info(f"output of open file: {output_open_file}")
        output_scroll_file = toolset.execute_action(
            action=Action.FILETOOL_SCROLL,
            params={},
        )
        logger.info(f"output of scroll file 1: {output_scroll_file}")
        output_scroll_file = toolset.execute_action(
            action=Action.FILETOOL_SCROLL,
            params={},
        )
        logger.info(f"output of scroll file 2: {output_scroll_file}")
        output_list = toolset.execute_action(
            action=Action.FILETOOL_LIST_FILES,
            params={},
        )
        logger.info(f"output of list files: {output_list}")
        output_list = toolset.execute_action(
            action=Action.FILETOOL_CREATE_FILE,
            params={"file_path": "random_file.txt"},
        )
        logger.info(f"output of create file: {output_list}")
        output_list = toolset.execute_action(
            action=Action.FILETOOL_EDIT_FILE,
            params={
                "file_path": "composio/tools/local/shelltool/shell_exec/actions/exec.py",
                "text": "    def something(self):\n        print('hello')\n\n",
                "start_line": 49,
                "end_line": 49,
            },
        )
        logger.info(f"output of edit file: {output_list}")

        output_list = toolset.execute_action(
            action=Action.FILETOOL_SEARCH_WORD,
            params={"word": "BaseFileAction", "pattern": "*.py", "exclude": [".tox"]},
        )
        logger.info(f"output of search word: {output_list}")

        output_list = toolset.execute_action(
            action=Action.FILETOOL_FIND_FILE,
            params={
                "pattern": "run_evaluation.py",
                "depth": None,
                "case_sensitive": False,
            },
        )
        logger.info(f"output of find file run_evaluation.py: {output_list}")

        output_list = toolset.execute_action(
            action=Action.FILETOOL_FIND_FILE,
            params={
                "pattern": "*run_evaluation.py",
                "depth": None,
                "case_sensitive": False,
            },
        )
        logger.info(f"output of find file *run_evaluation.py: {output_list}")

        output_chdir = toolset.execute_action(
            action=Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
            params={"path": "swe/swekit/benchmark"},
        )
        logger.info(f"output of change working directory: {output_chdir}")

        output_list = toolset.execute_action(
            action=Action.FILETOOL_LIST_FILES,
            params={},
        )
        logger.info(f"output of list files: {output_list}")
        output = toolset.execute_action(
            action=Action.FILETOOL_OPEN_FILE,
            params={"file_path": "README.md"},
        )
        _check_output(
            output=toolset.execute_action(
                action=Action.FILETOOL_EDIT_FILE,
                params={
                    "start_line": 1,
                    "end_line": 1,
                    "text": "# some text",
                },
            )
        )

        output = toolset.execute_action(
            action=Action.FILETOOL_GIT_PATCH,
            params={},
        )
        assert output[EXIT_CODE] == 0, output
        assert output[STDOUT] == (
            "diff --git a/README.md b/README.md\n"
            "index 8165d07..e8921f6 100644\n"
            "--- a/README.md\n"
            "+++ b/README.md\n"
            "@@ -1 +1 @@\n"
            "-Portfolio/Blog/Personal Website.\n"
            "\\ No newline at end of file\n"
            "+# some text\n"
        )
    finally:
        tempdir.cleanup()
        os.chdir(str(cwd))
        if allow_clone_without_repo is not None:
            os.environ["ALLOW_CLONE_WITHOUT_REPO"] = allow_clone_without_repo
        else:
            del os.environ["ALLOW_CLONE_WITHOUT_REPO"]
