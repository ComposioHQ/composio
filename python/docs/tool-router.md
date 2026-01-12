# Tool Router

The Tool Router provides a powerful way to create isolated MCP (Model Context Protocol) sessions for users with scoped access to toolkits and tools. It enables dynamic configuration of which tools are available within a session and manages authentication for multiple toolkits.

## Overview

Tool Router allows you to:

- Create isolated sessions with specific toolkit configurations
- Manage authentication flows for users across multiple toolkits
- Access tools via an MCP-compatible server URL
- Query toolkit connection states
- Integrate with multiple AI frameworks (OpenAI, Anthropic, LangChain, LlamaIndex, CrewAI)

> **Note:** When using MCP clients to connect to Tool Router, you don't need to pass a provider to the Composio constructor. A provider is only required when using `session.tools()` to get framework-specific tool objects.

## Installation

```bash
pip install composio
```

## Quick Start

### Using MCP (Recommended)

When using Tool Router with MCP clients, you don't need to pass a provider:

```python
from composio import Composio

composio = Composio()

# Create a session for a user with access to Gmail tools
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail']
)

# Use the MCP URL with any MCP-compatible client
print(session.mcp.url)
```

### Using Framework-Specific Tools

If you want to use `session.tools()` to get tools formatted for a specific AI framework, pass the appropriate provider:

```python
from composio import Composio
from composio_openai import OpenAIProvider

composio = Composio(provider=OpenAIProvider())

# Create a session for a user with access to Gmail tools
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail']
)

# Get the tools formatted for OpenAI
tools = session.tools()
```

## Creating Sessions

### Basic Session Creation

Use `composio.tool_router.create()` to create a new Tool Router session:

```python
from composio import Composio

composio = Composio()

# Create a session with Gmail access
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail']
)

print(f"Session ID: {session.session_id}")
print(f"MCP URL: {session.mcp.url}")
```

### Using an Existing Session

If you have an existing session ID, you can retrieve it using `composio.tool_router.use()`:

```python
session = composio.tool_router.use('existing_session_id')

# Access session properties
print(session.session_id)
print(session.mcp.url)
```

## Configuration Options

The session creation accepts the following configuration options:

### `toolkits`

Specify which toolkits to enable or disable in the session.

```python
# Simple list of toolkit slugs to enable
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail', 'slack', 'github']
)

# Explicit enabled configuration
session = composio.tool_router.create(
    user_id='user_123',
    toolkits={'enable': ['gmail', 'slack']}
)

# Disable specific toolkits (enable all others)
session = composio.tool_router.create(
    user_id='user_123',
    toolkits={'disable': ['calendar']}
)
```

### `tools`

Fine-grained control over which tools are available within toolkits. This is a dictionary where keys are toolkit slugs and values specify tool configuration for that toolkit.

```python
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail', 'github', 'slack'],
    tools={
        # List shorthand - enables only these tools
        'gmail': ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'],
        
        # Explicit enable configuration
        'github': {'enable': ['GITHUB_CREATE_ISSUE', 'GITHUB_LIST_ISSUES']},
        
        # Explicit disable configuration
        'slack': {'disable': ['SLACK_DELETE_MESSAGE']},
        
        # Filter by MCP tags (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)
        'linear': {'tags': ['readOnlyHint', 'idempotentHint']}
    }
)
```

### `tags`

Global MCP tags to filter tools by across all toolkits. Only tools matching these tags will be available. Toolkit-level tags (specified in `tools`) override this global setting.

```python
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail', 'github', 'slack'],
    tags=['readOnlyHint', 'idempotentHint']  # Only show read-only and idempotent tools
)
```

Available tag values:
- `'readOnlyHint'`: Tools that only read data
- `'destructiveHint'`: Tools that modify or delete data
- `'idempotentHint'`: Tools that can be safely retried
- `'openWorldHint'`: Tools that operate in an open world context

### `auth_configs`

Map toolkits to specific authentication configurations:

```python
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail', 'github'],
    auth_configs={
        'gmail': 'ac_gmail_work',
        'github': 'ac_github_personal'
    }
)
```

### `connected_accounts`

Map toolkits to specific connected account IDs:

```python
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail'],
    connected_accounts={
        'gmail': 'ca_abc123'
    }
)
```

### `manage_connections`

Control how connections are managed within the session:

```python
# Boolean: enable/disable automatic connection management
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail'],
    manage_connections=True  # default
)

# Dict: fine-grained control
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail'],
    manage_connections={
        'enable': True,  # Whether to use tools to manage connections
        'callback_url': 'https://your-app.com/auth/callback',  # Optional OAuth callback URL
        'wait_for_connections': True  # NEW in v0.10.5: Wait for connections to complete
    }
)
```

#### Wait for Connections

The `wait_for_connections` property (new in v0.10.5) allows the tool router session to wait for users to complete authentication before proceeding to the next step. When set to `True`, the session will block execution until all required connections are established.

```python
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail', 'slack'],
    manage_connections={
        'enable': True,
        'callback_url': 'https://your-app.com/auth/callback',
        'wait_for_connections': True  # Session waits for connections to complete
    }
)
```

### `workbench`

Configure workbench behavior:

```python
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail'],
    workbench={
        'enable_proxy_execution': False,  # Whether to allow proxy execute calls in workbench
        'auto_offload_threshold': 300  # Maximum execution payload size to offload to workbench
    }
)
```

## Session Properties and Methods

A Tool Router session provides the following properties and methods:

### `session_id`

The unique identifier for this session.

```python
print(session.session_id)
```

### `mcp`

The MCP server configuration for this session, including authentication headers.

```python
print(session.mcp.url)     # The URL to connect to
print(session.mcp.type)    # ToolRouterMCPServerType.HTTP or ToolRouterMCPServerType.SSE
print(session.mcp.headers) # Authentication headers (includes x-api-key)
```

### `tools(modifiers=None)`

Retrieve the tools available in the session, formatted for your AI framework.

```python
# Basic usage
tools = session.tools()

# With session-specific modifiers (new in v0.10.5)
from composio.core.models import before_execute_meta, after_execute_meta

@before_execute_meta
def before_modifier(tool, toolkit, session_id, params):
    print(f"[Session: {session_id}] Executing {tool} from {toolkit}")
    # Add custom logging, validation, or parameter transformation
    return params

@after_execute_meta  
def after_modifier(tool, toolkit, session_id, response):
    print(f"[Session: {session_id}] Completed {tool}")
    # Transform results, add telemetry, or handle errors
    return response

tools = session.tools(modifiers=[before_modifier, after_modifier])
```

#### Session-Specific Modifiers

Tool Router sessions now support enhanced modifiers (introduced in v0.10.5) that include session context:

- **`@before_execute_meta`**: Modify parameters before execution, with access to session ID
- **`@after_execute_meta`**: Transform results after execution, with access to session ID
- **`@modify_schema_meta`**: Customize tool schemas before they're sent to the AI model

These modifiers provide better context for session-based tool execution, allowing you to track which session is executing which tools.

### Meta Tools

Tool Router provides meta tools for managing connections and session state. You can access these directly using the `get_raw_tool_router_meta_tools` method (introduced in v0.10.5):

```python
from composio import Composio
from composio.core.models import modify_schema_meta

composio = Composio()

# Define schema modifier
@modify_schema_meta
def schema_modifier(tool, toolkit, schema):
    # Customize meta tool schemas
    print(f"Modifying schema for {tool}")
    return schema

# Get raw meta tools for a session
meta_tools = composio.tools.get_raw_tool_router_meta_tools(
    session_id='session_123',
    modifiers=[schema_modifier]
)

print(f"Available meta tools: {[t.name for t in meta_tools]}")
```

Meta tools allow you to:
- Authorize new toolkit connections within a session
- Query toolkit connection states
- Manage session configuration

This method is useful when you need direct access to the underlying meta tools without creating a full session object.

### `authorize(toolkit, *, callback_url=None)`

Initiate an authorization flow for a toolkit.

```python
# Start authorization for Gmail
connection_request = session.authorize('gmail')

print(connection_request.redirect_url)  # URL to redirect user for auth

# Wait for the user to complete authorization
connected_account = connection_request.wait_for_connection()
print(f"Connected: {connected_account}")

# With custom callback URL
connection_request = session.authorize(
    'gmail',
    callback_url='https://your-app.com/auth/callback'
)
```

### `toolkits(...)`

Query the connection state of toolkits in the session.

```python
# Get all toolkits
result = session.toolkits()

for toolkit in result.items:
    print(f"{toolkit.name} ({toolkit.slug})")
    if toolkit.connection:
        print(f"  Connected: {toolkit.connection.is_active}")
        if toolkit.connection.connected_account:
            print(f"  Account ID: {toolkit.connection.connected_account.id}")
            print(f"  Status: {toolkit.connection.connected_account.status}")

# With pagination
result = session.toolkits(limit=10, next_cursor='cursor_abc')

# Filter by specific toolkits
result = session.toolkits(toolkits=['gmail', 'slack'])

# Filter by connection status
connected_toolkits = session.toolkits(is_connected=True)
disconnected_toolkits = session.toolkits(is_connected=False)

# Combine all options
result = session.toolkits(
    toolkits=['gmail', 'github'],
    limit=5,
    is_connected=True
)
```

## Framework Integrations

### OpenAI

```python
from openai import OpenAI
from composio import Composio
from composio_openai import OpenAIProvider

composio = Composio(provider=OpenAIProvider())
client = OpenAI()

session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail']
)

tools = session.tools()

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Find my last email from gmail"}],
    tools=tools,
)

print(response.choices[0].message)
```

### Anthropic

```python
from anthropic import Anthropic
from composio import Composio
from composio_anthropic import AnthropicProvider

composio = Composio(provider=AnthropicProvider())
client = Anthropic()

session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail']
)

tools = session.tools()

response = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Find my last email from gmail"}],
    tools=tools,
)

print(response.content)
```

### LangChain

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate
from composio import Composio
from composio_langchain import LangChainProvider

composio = Composio(provider=LangChainProvider())

session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail']
)

tools = session.tools()
llm = ChatOpenAI(model="gpt-4")

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools)

result = agent_executor.invoke({"input": "Find my last email from gmail"})
print(result)
```

### Using MCP URL Directly

You can also use the MCP URL directly with any MCP-compatible client:

```python
from composio import Composio

composio = Composio()

session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail'],
    manage_connections=True
)

# Use with any MCP client
mcp_url = session.mcp.url
mcp_headers = session.mcp.headers  # Pre-configured authentication headers
print(f"MCP URL: {mcp_url}")
print(f"MCP Type: {session.mcp.type}")  # 'http' or 'sse'
print(f"MCP Headers: {mcp_headers}")    # {'x-api-key': 'your-api-key'}
```

## Authorization Flow

When a user needs to connect a toolkit, use the `authorize()` method:

```python
from composio import Composio

composio = Composio()

session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail']
)

# Initiate authorization for Gmail
connection_request = session.authorize('gmail')

# Log the redirect URL for the user
print(f"Redirect URL: {connection_request.redirect_url}")

# Wait for the user to complete the authorization (with timeout)
connected_account = connection_request.wait_for_connection(timeout=300)
print(f"Connected Account: {connected_account}")
```

You can also provide a custom callback URL:

```python
connection_request = session.authorize(
    'gmail',
    callback_url='https://your-app.com/auth/callback'
)
```

## Querying Toolkit States

Use the `toolkits()` method to check connection states:

```python
from composio import Composio

composio = Composio()

session = composio.tool_router.create(user_id='user_123')

# Get all toolkits
result = session.toolkits()

for toolkit in result.items:
    status = "Connected" if toolkit.connection and toolkit.connection.is_active else "Not connected"
    print(f"{toolkit.name}: {status}")

# Get only connected toolkits
connected = session.toolkits(is_connected=True)
print(f"You have {len(connected.items)} connected toolkits")

# Get only disconnected toolkits (need authorization)
disconnected = session.toolkits(is_connected=False)
for toolkit in disconnected.items:
    print(f"Please connect: {toolkit.name}")

# Pagination example
result = session.toolkits(limit=10)
all_toolkits = list(result.items)
while result.next_cursor:
    result = session.toolkits(limit=10, next_cursor=result.next_cursor)
    all_toolkits.extend(result.items)
```

The response structure:

```python
{
    'items': [
        {
            'slug': 'gmail',
            'name': 'Gmail',
            'logo': 'https://...',
            'is_no_auth': False,
            'connection': {
                'is_active': True,
                'auth_config': {
                    'id': 'ac_xxx',
                    'mode': 'OAUTH2',
                    'is_composio_managed': True
                },
                'connected_account': {
                    'id': 'ca_xxx',
                    'status': 'ACTIVE'
                }
            }
        }
    ],
    'next_cursor': 'cursor_abc',
    'total_pages': 1
}
```

## Best Practices

1. **User Isolation**: Create separate sessions per user to ensure proper isolation of connections and tools.

2. **Toolkit Selection**: Only enable toolkits that are necessary for the use case to maintain security and reduce complexity.

3. **Connection Management**: Use `manage_connections=True` (default) for interactive applications where users can be prompted to connect accounts.

4. **Tag Filtering**: Use global `tags` to restrict tools to safe operations (e.g., `['readOnlyHint']`) or toolkit-specific tags in the `tools` configuration for fine-grained control.

5. **Session Reuse**: Store and reuse `session_id` to maintain user sessions across requests.

```python
import redis

# Store session ID after creation
session = composio.tool_router.create(user_id='user_123', toolkits=['gmail'])
redis_client.set(f"session:user_123", session.session_id)

# Retrieve existing session
session_id = redis_client.get(f"session:user_123")
if session_id:
    session = composio.tool_router.use(session_id)
```

## Type Reference

### ToolRouterSession

```python
@dataclass
class ToolRouterSession:
    session_id: str
    mcp: ToolRouterMCPServerConfig
    tools: Callable[[Optional[Modifiers]], Any]
    authorize: Callable[..., ConnectionRequest]
    toolkits: Callable[..., ToolkitConnectionsDetails]
```

### ToolRouterMCPServerConfig

```python
class ToolRouterMCPServerType(str, Enum):
    HTTP = "http"
    SSE = "sse"

@dataclass
class ToolRouterMCPServerConfig:
    type: ToolRouterMCPServerType
    url: str
    headers: Optional[Dict[str, Optional[str]]] = None  # Authentication headers (includes x-api-key)
```

### ToolkitConnectionState

```python
@dataclass
class ToolkitConnectionState:
    slug: str
    name: str
    is_no_auth: bool
    connection: Optional[ToolkitConnection] = None
    logo: Optional[str] = None

@dataclass
class ToolkitConnection:
    is_active: bool
    auth_config: Optional[ToolkitConnectionAuthConfig] = None
    connected_account: Optional[ToolkitConnectedAccount] = None

@dataclass
class ToolkitConnectionAuthConfig:
    id: str
    mode: str
    is_composio_managed: bool

@dataclass
class ToolkitConnectedAccount:
    id: str
    status: str
```

### ToolkitConnectionsDetails

```python
@dataclass
class ToolkitConnectionsDetails:
    items: List[ToolkitConnectionState]
    total_pages: int
    next_cursor: Optional[str] = None
```

### Configuration Types

```python
from typing import List, Dict, Union, Literal
from typing_extensions import TypedDict

# Toolkits configuration
ToolRouterToolkitsEnableConfig = TypedDict('ToolRouterToolkitsEnableConfig', {
    'enable': List[str]
})

ToolRouterToolkitsDisableConfig = TypedDict('ToolRouterToolkitsDisableConfig', {
    'disable': List[str]
})

toolkits: Union[
    List[str],                          # ['gmail', 'slack']
    ToolRouterToolkitsEnableConfig,     # {'enable': ['gmail', 'slack']}
    ToolRouterToolkitsDisableConfig      # {'disable': ['calendar']}
]

# Tools configuration
ToolRouterToolsEnableConfig = TypedDict('ToolRouterToolsEnableConfig', {
    'enable': List[str]
})

ToolRouterToolsDisableConfig = TypedDict('ToolRouterToolsDisableConfig', {
    'disable': List[str]
})

ToolRouterToolsTagsConfig = TypedDict('ToolRouterToolsTagsConfig', {
    'tags': List[Literal['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']]
})

ToolRouterToolsConfig = Union[
    List[str],                          # ['GMAIL_SEND_EMAIL', 'GMAIL_FETCH_EMAILS']
    ToolRouterToolsEnableConfig,        # {'enable': ['GMAIL_SEND_EMAIL']}
    ToolRouterToolsDisableConfig,       # {'disable': ['GMAIL_DELETE_EMAIL']}
    ToolRouterToolsTagsConfig           # {'tags': ['readOnlyHint']}
]

tools: Dict[str, ToolRouterToolsConfig]  # Key is toolkit slug, value is ToolRouterToolsConfig

# Tags configuration (global)
tags: List[Literal['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']]

# Manage connections configuration
ToolRouterManageConnectionsConfig = TypedDict('ToolRouterManageConnectionsConfig', {
    'enable': bool,
    'callback_url': str,  # Optional
    'wait_for_connections': bool  # NEW in v0.10.5: Wait for connections to complete
})

manage_connections: Union[
    bool,
    ToolRouterManageConnectionsConfig   # {'enable': True, 'callback_url': 'https://...', 'wait_for_connections': True}
]

# Workbench configuration
ToolRouterWorkbenchConfig = TypedDict('ToolRouterWorkbenchConfig', {
    'enable_proxy_execution': bool,      # Whether to allow proxy execute calls
    'auto_offload_threshold': int        # Maximum execution payload size to offload to workbench
})

workbench: ToolRouterWorkbenchConfig
```

## What's New in v0.10.5

### 1. Wait for Connections

The new `wait_for_connections` property allows sessions to wait for users to complete authentication before proceeding:

```python
session = composio.tool_router.create(
    user_id='user_123',
    toolkits=['gmail', 'slack'],
    manage_connections={
        'enable': True,
        'callback_url': 'https://your-app.com/callback',
        'wait_for_connections': True  # NEW
    }
)
```

### 2. Enhanced Session Modifiers

Session-specific modifiers now include session context, making it easier to track and manage tool execution:

```python
from composio.core.models import before_execute_meta, after_execute_meta

@before_execute_meta
def before_modifier(tool, toolkit, session_id, params):
    print(f"[{session_id}] Executing {tool}")
    return params

@after_execute_meta  
def after_modifier(tool, toolkit, session_id, response):
    print(f"[{session_id}] Completed {tool}")
    return response

tools = session.tools(modifiers=[before_modifier, after_modifier])
```

### 3. Direct Meta Tools Access

New method to fetch meta tools directly from a session:

```python
from composio.core.models import modify_schema_meta

@modify_schema_meta
def schema_modifier(tool, toolkit, schema):
    return schema

meta_tools = composio.tools.get_raw_tool_router_meta_tools(
    session_id='session_123',
    modifiers=[schema_modifier]
)
```

### 4. Performance Improvements

- Optimized tool fetching with fewer API calls
- Improved session API architecture for better reliability
- Simplified internal tool execution paths

All changes in v0.10.5 are fully backward compatible with existing code.

