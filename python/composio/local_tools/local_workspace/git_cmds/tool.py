from composio.core.local import Tool
from composio.local_tools.local_workspace.git_cmds.actions import (
    GetPatchCmd,
    GitRepoTree,
    GithubCloneCmd,
)


class GitCmdTool(Tool):
    """
    command manager tool for workspace
    """

    def actions(self) -> list:
        return [GitRepoTree, GithubCloneCmd, GetPatchCmd]

    def triggers(self) -> list:
        return []
