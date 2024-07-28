"""Test workspace tools."""

import os
import tempfile
from pathlib import Path

import pytest

from composio import Action, ComposioToolSet
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.env.factory import WorkspaceType



PATH = Path(__file__).parent


def test_workspace_history() -> None:
    """Test outputs."""
    toolset = ComposioToolSet(
        workspace_config=WorkspaceType.Host(),
    )
    output = toolset.execute_action(
        action=Action.HISTORYFETCHERTOOL_GET_WORKSPACE_HISTORY,
        params={"last_n_commands": 2},
    )

    assert len(output['workspace_command_history']) > 0, "No commands found in workspace history."

