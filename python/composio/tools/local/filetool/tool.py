"""
File I/O tool for Composio.
"""

import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import (
    ChangeWorkingDirectory,
    CreateFile,
    EditFile,
    FindFile,
    GitClone,
    GitCustom,
    GitPatch,
    GitRepoTree,
    ListFiles,
    OpenFile,
    RenameFile,
    Scroll,
    SearchWord,
    Write,
)


class Filetool(LocalTool, autoload=True):
    """File I/O tool."""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/filetool.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [
            OpenFile,
            RenameFile,
            EditFile,
            CreateFile,
            Scroll,
            ListFiles,
            SearchWord,
            FindFile,
            Write,
            ChangeWorkingDirectory,
            GitClone,
            GitRepoTree,
            GitPatch,
            GitCustom,
        ]
