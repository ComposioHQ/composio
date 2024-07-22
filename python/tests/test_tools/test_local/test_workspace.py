"""Test workspace tools."""

import os
import tempfile
import time
from pathlib import Path

from composio import Action, ComposioToolSet
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.env.factory import WorkspaceFactory, WorkspaceType
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


def test_docker_workspace() -> None:
    """Test docker workspace."""
    workspace = WorkspaceFactory.new(config=WorkspaceType.Docker())
    logger = get_logger()

    start_time = time.time()
    toolset = ComposioToolSet(workspace_id=workspace.id)
    end_time = time.time()
    print(
        f"Time taken to initialize ComposioToolSet: {end_time - start_time:.4f} seconds"
    )
    output = toolset.execute_action(
        action=Action.SHELL_EXEC_COMMAND,
        params={"cmd": "ls"},
    )
    output = toolset.execute_action(
        action=Action.FILETOOL_OPEN_FILE,
        params={"file_name": "git_repo_tree.txt"},
    )
    logger.info("output of open git repo tree:", output)
    output = toolset.execute_action(
        action=Action.SEARCHTOOL_SEARCH_DIR_CMD,
        params={"search_term": "FILE_UPLOAD_PERMISSION", "directory": "django/conf"},
    )
    logger.info(f"output of search dir: {output}")
    output = toolset.execute_action(
        action=Action.FILEEDITTOOL_OPEN_FILE,
        params={"file_name": "django/conf/global_settings.py"},
    )
    _check_output(output=output)
    logger.info(f"output of open global settings: {output}")
    logger.info(f"output of search dir: {output}")
    output = toolset.execute_action(
        action=Action.FILEEDITTOOL_OPEN_FILE,
        params={"file_name": "django/conf/global_settings.py", "line_number": 50},
    )
    _check_output(output=output)
    logger.info(f"output of open global settings: {output}")
    logger.info(f"output of search dir: {output}")
    output = toolset.execute_action(
        action=Action.FILEEDITTOOL_OPEN_FILE,
        params={"file_name": "django/conf/global_settings.py", "line_number": 100},
    )
    _check_output(output=output)
    logger.info(f"output of open global settings: {output}")
    assert False


def test_workspace() -> None:
    """Test workspace tools."""
    tempdir = tempfile.TemporaryDirectory()  # pylint: disable=consider-using-with
    allow_clone_without_repo = os.environ.get("ALLOW_CLONE_WITHOUT_REPO")
    os.environ["ALLOW_CLONE_WITHOUT_REPO"] = "true"
    try:
        toolset = ComposioToolSet(
            workspace_config=WorkspaceType.Host(),
        )
        _check_output(
            output=toolset.execute_action(
                action=Action.SHELL_EXEC_COMMAND,
                params={"cmd": f"cd {tempdir.name}"},
            )
        )
        _check_output(
            output=toolset.execute_action(
                action=Action.GITCMDTOOL_GITHUB_CLONE_CMD,
                params={"repo_name": "angrybayblade/web"},
            )
        )
        output = toolset.execute_action(
            action=Action.FILEEDITTOOL_OPEN_FILE,
            params={"file_name": "random_file.txt"},
        )
        logger = get_logger()
        logger.info("output of open wrong file", output)
        output_open_file = toolset.execute_action(
            action=Action.FILETOOL_OPEN_FILE,
            params={"file_path": "README.md"},
        )
        logger.info(f"output of open file: {output_open_file}")
        output_scroll_file = toolset.execute_action(
            action=Action.FILETOOL_SCROLL,
            params={},
        )
        logger.info(f"output of scroll file: {output_scroll_file}")
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
                "file_path": "random_file.txt",
                "text": "hello",
                "start_line": 1,
                "end_line": 1,
            },
        )
        logger.info(f"output of edit file: {output_list}")

        output_list = toolset.execute_action(
            action=Action.FILETOOL_SEARCH_WORD,
            params={"word": "BaseFileAction", "pattern": "*.py"},
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
        assert False
        output = toolset.execute_action(
            action=Action.FILEEDITTOOL_OPEN_FILE,
            params={"file_name": "README.md"},
        )
        _check_output(output=output)
        _check_output(
            output=toolset.execute_action(
                action=Action.FILEEDITTOOL_EDIT_FILE,
                params={
                    "start_line": 1,
                    "end_line": 1,
                    "replacement_text": "# some text",
                },
            )
        )

        output = toolset.execute_action(
            action=Action.GITCMDTOOL_GET_PATCH_CMD,
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
        if allow_clone_without_repo is not None:
            os.environ["ALLOW_CLONE_WITHOUT_REPO"] = allow_clone_without_repo
        else:
            del os.environ["ALLOW_CLONE_WITHOUT_REPO"]
