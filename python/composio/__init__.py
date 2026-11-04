import typing as t

from .__version__ import __version__
from .core.models.custom_tool import ExperimentalToolkit, LocalToolkit
from .core.models.custom_tool_types import (
    LocalTool,
    SessionContext,
)
from .core.models.tool_router_constants import SESSION_PRESET_DIRECT_TOOLS
from .core.models.tool_router_session_files import RemoteFile
from .core.models.tools import (
    after_execute,
    before_execute,
    before_file_upload,
    schema_modifier,
)
from .core.models.webhook_events import (
    ConnectionExpiredEvent,
    ConnectionState,
    ConnectionStatusEnum,
    SingleConnectedAccountDetailedResponse,
    WebhookConnectionMetadata,
    WebhookEvent,
    WebhookEventType,
    is_connection_expired_event,
)
from .exceptions import ComposioDeprecationWarning
from .core.types import (
    ToolkitLatestVersion,
    ToolkitVersion,
    ToolkitVersionParam,
    ToolkitVersions,
)
from .sdk import Composio

__all__ = (
    "Composio",
    "ComposioDeprecationWarning",
    "CustomTool",
    "ExperimentalToolkit",
    "LocalTool",
    "LocalToolkit",
    "RemoteFile",
    "SessionContext",
    "SESSION_PRESET_DIRECT_TOOLS",
    "ConnectionExpiredEvent",
    "ConnectionState",
    "ConnectionStatusEnum",
    "SingleConnectedAccountDetailedResponse",
    "WebhookConnectionMetadata",
    "WebhookEvent",
    "WebhookEventType",
    "after_execute",
    "before_execute",
    "before_file_upload",
    "is_connection_expired_event",
    "schema_modifier",
    "__version__",
    "ToolkitLatestVersion",
    "ToolkitVersion",
    "ToolkitVersions",
    "ToolkitVersionParam",
)

# The deprecated names are served by __getattr__ so importing them warns;
# type checkers still resolve them through this block.
if t.TYPE_CHECKING:
    from .core.models.custom_tool_types import CustomTool as CustomTool


def __getattr__(name: str) -> t.Any:
    from .core.models.custom_tool_types import get_deprecated_export

    return get_deprecated_export(__name__, name)
