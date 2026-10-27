# Prepended to every docs Python snippet before type-checking.
# Declares SDK objects that docs fragments use without creating them, so mypy
# checks calls on them against the SDK. Each public binding sits on its own line
# and is blanked out when the snippet binds that name itself; `_` names stay.
from composio import Composio as _Composio
from composio.client.types import auth_config_create_response as _auth_config_create_response
from composio.client.types import connected_account_retrieve_response as _connected_account_retrieve_response
from composio.core.models.connected_accounts import ConnectionRequest as _ConnectionRequest
from composio.core.models.tool_router_session import ToolRouterSessionWithMcp as _ToolRouterSessionWithMcp

from composio import Composio
composio: _Composio
session: _ToolRouterSessionWithMcp
user_id: str
connected_account_id: str
auth_config_id: str
connected_account: _connected_account_retrieve_response.ConnectedAccountRetrieveResponse
auth_config: _auth_config_create_response.AuthConfig
connection_request: _ConnectionRequest
