import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import (
    CreateCodeMap,
    GetClassInfo,
    GetMethodBody,
    GetMethodSignature,
    GetRelevantCode,
)


class CodeAnalysisTool(LocalTool, autoload=True):
    """Code index tool."""

    requires = [
        "tree_sitter==0.21.3",
        "deeplake>3.9,<4",
        "sentence-transformers",
        "tokenizers>=0.20,<0.21",
        "tree_sitter_languages",
        "git+https://github.com/DataDog/jedi.git@92d0c807b0dcd115b1ffd0a4ed21e44db127c2fb#egg=jedi",
        "PyJWT",  # deeplake/client/client.py:41
    ]

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/codemap.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [
            CreateCodeMap,
            GetClassInfo,
            GetMethodBody,
            GetMethodSignature,
            GetRelevantCode,
        ]
