# Conventional bindings for Python documentation fragments.
from composio.client.types import auth_config_create_response as _auth_config_create_response
from composio.client.types import connected_account_retrieve_response as _connected_account_retrieve_response
user_id: str
connected_account_id: str
auth_config_id: str
connected_account: _connected_account_retrieve_response.ConnectedAccountRetrieveResponse
auth_config: _auth_config_create_response.AuthConfig

# Sync client
from composio import Composio as _Client
from composio import Composio
from composio.core.models.connected_accounts import ConnectionRequest as _ConnectionRequest
from composio.core.models.tool_router_session import ToolRouterSessionWithMcp as _Session
composio: _Client
session: _Session
connection_request: _ConnectionRequest

# Async client
from composio import AsyncComposio as _Client
from composio import AsyncComposio
from composio.core.models._async_resources.connected_accounts import AsyncConnectionRequest as _ConnectionRequest
from composio.core.models._async_sessions import AsyncToolRouterSessionWithMcp as _Session
composio: _Client
session: _Session
connection_request: _ConnectionRequest
