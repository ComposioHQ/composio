"""Local tools."""

from pathlib import Path

from composio.tools.base.abs import ToolRegistry, tool_registry


TOOLS_PATH = Path(__file__).parent


def load_local_tools() -> (
    ToolRegistry
):  # pylint: disable=import-outside-toplevel,unused-import
    from composio.tools.local.browsertool import BrowserTool
    from composio.tools.local.codeformat import CodeFormatTool
    from composio.tools.local.codegrep import CodeGrepTool
    from composio.tools.local.codeindex import CodeIndexTool
    from composio.tools.local.codemap import CodeMapTool
    from composio.tools.local.embedtool import EmbedTool
    from composio.tools.local.filetool import Filetool
    from composio.tools.local.greptile import Greptile
    from composio.tools.local.imageanalyser import ImageAnalyser
    from composio.tools.local.mathematical import Mathematical
    from composio.tools.local.ragtool import Ragtool
    from composio.tools.local.shelltool.git_cmds import Git
    from composio.tools.local.shelltool.history_keeper import HistoryFetcher
    from composio.tools.local.shelltool.shell_exec import Shelltool
    from composio.tools.local.spidertool import Spidertool
    from composio.tools.local.sqltool import Sqltool
    from composio.tools.local.system.system_tool import SystemTools
    from composio.tools.local.webtool import Webtool
    from composio.tools.local.zep import Zeptool

    return tool_registry
