"""Test workspace tools."""

from pathlib import Path

from composio import Action, ComposioToolSet
from composio.tools.env.factory import WorkspaceType


PATH = Path(__file__).parent


def test_workspace_history() -> None:
    """Test workspace history retrieval."""
    toolset = ComposioToolSet(workspace_config=WorkspaceType.Host())
    shell_creation_output = toolset.execute_action(
        action=Action.SHELL_CREATE_SHELL,
        params={},
    )
    shell_id = shell_creation_output["shell_id"]

    toolset.execute_action(
        action=Action.SHELL_EXEC_COMMAND,
        params={"cmd": f"ls {PATH}", "shell_id": shell_id},
    )

    history_output = toolset.execute_action(
        action=Action.HISTORYFETCHERTOOL_GET_WORKSPACE_HISTORY,
        params={"last_n_commands": 4, "shell_id": shell_id},
    )

    command_history = history_output["workspace_command_history"]
    assert history_output["is_success"]
    assert "ls" in command_history[0].dict()["command"]
    assert len(command_history) > 0
