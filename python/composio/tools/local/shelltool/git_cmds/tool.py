from composio.tools.local.base import Tool
from composio.tools.local.shelltool.git_cmds.actions import (
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
