"""Local tools."""

from pathlib import Path

from composio.tools.local.codeformat import CodeFormatTool
from composio.tools.local.codegrep import CodeGrepTool
from composio.tools.local.codeindex import CodeIndexTool
from composio.tools.local.codemap import CodeMapTool
from composio.tools.local.embedtool import EmbedTool
from composio.tools.local.filetool import FileTool
from composio.tools.local.greptile import Greptile
from composio.tools.local.mathematical import Mathematical
from composio.tools.local.ragtool import RagTool
from composio.tools.local.shelltool.file_cmds import FileEditTool
from composio.tools.local.shelltool.find_cmds import SearchTool
from composio.tools.local.shelltool.git_cmds import GitCmdTool
from composio.tools.local.shelltool.history_keeper import HistoryFetcherTool
from composio.tools.local.shelltool.shell_exec import ShellExec
from composio.tools.local.spidertool import SpiderTool
from composio.tools.local.sqltool import SqlTool
from composio.tools.local.webtool import WebTool
from composio.tools.local.zep import ZepTool


TOOLS_PATH = Path(__file__).parent

TOOLS = [
    CodeIndexTool,
    CodeFormatTool,
    CodeGrepTool,
    CodeMapTool,
    EmbedTool,
    Mathematical,
    FileTool,
    Greptile,
    RagTool,
    FileEditTool,
    SearchTool,
    GitCmdTool,
    HistoryFetcherTool,
    ShellExec,
    SpiderTool,
    SqlTool,
    WebTool,
    ZepTool,
]
