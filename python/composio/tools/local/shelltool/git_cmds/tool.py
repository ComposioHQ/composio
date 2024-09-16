import typing as t

from composio.tools.base.local import LocalAction, LocalTool
from composio.tools.local.shelltool.git_cmds.actions import (
    GetPatchCmd,
    GitRepoTree,
    GithubCloneCmd,
)


class Git(LocalTool, autoload=True):
    """Command manager tool for workspace"""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/shelltool.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        return [
            GitRepoTree,
            GithubCloneCmd,
            GetPatchCmd,
        ]
