"""Test workspace tools."""


import os
import tempfile
from pathlib import Path

from composio import Action, ComposioToolSet
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.env.factory import ExecEnv


PATH = Path(__file__).parent


def test_outputs() -> None:
    """Test outputs."""
    toolset = ComposioToolSet(
        workspace_env=ExecEnv.HOST,
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
        workspace_env=ExecEnv.HOST,
    )
    output = toolset.execute_action(
        action=Action.SHELL_EXEC_COMMAND,
        params={"cmd": "ls ./random"},
    )
    assert "No such file or directory" in output[STDERR]


def _check_output(output: dict) -> None:
    """Check tool output."""
    assert output[EXIT_CODE] == 0, output


def test_workspace() -> None:
    """Test workspace tools."""
    tempdir = tempfile.TemporaryDirectory()  # pylint: disable=consider-using-with
    allow_clone_without_repo = os.environ.get("ALLOW_CLONE_WITHOUT_REPO")
    os.environ["ALLOW_CLONE_WITHOUT_REPO"] = "true"
    try:
        toolset = ComposioToolSet(
            workspace_env=ExecEnv.HOST,
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
        _check_output(
            output=toolset.execute_action(
                action=Action.FILEEDITTOOL_OPEN_FILE,
                params={"file_name": "README.md"},
            )
        )
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
