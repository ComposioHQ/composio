![Composio Banner](https://github.com/user-attachments/assets/9ba0e9c1-85a4-4b51-ae60-f9fe7992e819)

# Composio

The Composio Python SDK allows you to interact with the Composio Platform. It provides a powerful and flexible way to manage and execute tools, handle authentication, and integrate with various AI frameworks and platforms.

[Learn more about the SDK from our docs](https://docs.composio.dev)

## Core Features

- **Tools**: Manage and execute tools within the Composio ecosystem. Includes functionality to list, retrieve, and execute tools.
- **Toolkits**: Organize and manage collections of tools for specific use cases.
- **Triggers**: Create and manage event triggers that can execute tools based on specific conditions.
- **AuthConfigs**: Configure authentication providers and settings.
- **ConnectedAccounts**: Manage third-party service connections.
- **ActionExecution**: Track and manage the execution of actions within the platform.
- **Provider Integrations**: Built-in support for OpenAI, Anthropic, LangChain, CrewAI, AutoGen, and more.

## Installation

```bash
pip install composio
# or
pip install composio-core
```

### Provider-Specific Installations

For specific AI framework integrations:

```bash
# OpenAI integration
pip install composio-openai

# LangChain integration  
pip install composio-langchain

# CrewAI integration
pip install composio-crewai

# Anthropic integration
pip install composio-anthropic

# AutoGen integration
pip install composio-autogen

# And many more...
```

## Getting Started

### Basic Usage with OpenAI

```python
import os
from composio import Composio
from openai import OpenAI

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize Composio with your API key
composio = Composio(api_key=os.getenv("COMPOSIO_API_KEY"))

def main():
    try:
        # Fetch tools - single tool or multiple tools
        tools = composio.tools.get(user_id="default", slug="HACKERNEWS_GET_USER")
        # Or fetch multiple tools: composio.tools.get(user_id="default", toolkits=["hackernews"])

        query = "Find information about the HackerNews user 'pg'"

        # Create chat completion with tools
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system", 
                    "content": "You are a helpful assistant that can use tools to answer questions."
                },
                {"role": "user", "content": query}
            ],
            tools=tools,
            tool_choice="auto"
        )

        # Handle tool calls if the assistant decides to use them
        if response.choices[0].message.tool_calls:
            print("🔧 Assistant is using tool:", response.choices[0].message.tool_calls[0].function.name)
            
            # Execute the tool call
            tool_result = composio.provider.handle_tool_calls(
                response=response,
                user_id="default"
            )
            
            print("✅ Tool execution result:", tool_result)
            
            # Get final response from assistant with tool result
            final_response = openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful assistant that can use tools to answer questions."
                    },
                    {"role": "user", "content": query},
                    response.choices[0].message,
                    {
                        "role": "tool",
                        "tool_call_id": response.choices[0].message.tool_calls[0].id,
                        "content": str(tool_result)
                    }
                ]
            )
            
            print("🤖 Final response:", final_response.choices[0].message.content)
        else:
            print("🤖 Response:", response.choices[0].message.content)
            
    except Exception as error:
        print("❌ Error:", error)

if __name__ == "__main__":
    main()
```

### Using with Provider Integrations

#### OpenAI Provider

```python
from composio_openai import OpenAIProvider
from openai import OpenAI
from composio import Composio

# Initialize with OpenAI provider
openai_client = OpenAI()
composio = Composio(provider=OpenAIProvider())

# Define task
task = "Star a repo composiohq/composio on GitHub"

# Get GitHub tools that are pre-configured
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# Get response from the LLM
response = openai_client.chat.completions.create(
    model="gpt-4o-mini",
    tools=tools,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": task},
    ],
)

# Execute the function calls
result = composio.provider.handle_tool_calls(response=response, user_id="default")
print(result)
```

#### LangChain Integration

```python
from composio_langchain import ComposioToolSet
from langchain_openai import ChatOpenAI

# Initialize the toolset
toolset = ComposioToolSet()

# Get tools for a specific toolkit
tools = toolset.get_tools(toolkits=["GITHUB"])

# Initialize LLM
llm = ChatOpenAI(model="gpt-4o")

# Create agent with tools
from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant"),
    ("user", "{input}"),
    ("assistant", "{agent_scratchpad}")
])

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools)

# Execute task
result = agent_executor.invoke({"input": "Star the composiohq/composio repository"})
print(result)
```

## Configuration

The Composio constructor accepts the following configuration options:

```python
from composio import Composio
from composio.core.provider import OpenAIProvider

composio = Composio(
    api_key="your-api-key",  # Your Composio API key
    base_url="https://api.composio.dev",  # Custom API base URL (optional)
    timeout=60,  # Request timeout in seconds
    max_retries=3,  # Maximum number of retries
    allow_tracking=True,  # Enable/disable telemetry (default: True)
    file_download_dir="./downloads",  # Directory for file downloads
    provider=OpenAIProvider(),  # Custom provider (default: OpenAIProvider)
    toolkit_versions={ "github": "12202025_01" }  # Toolkit versions to use
)
```

## Modifiers

Composio SDK supports powerful modifiers to transform tool schemas and execution behavior.

### Schema Modifiers

Schema modifiers allow you to transform tool schemas before they are used:

```python
from composio import schema_modifier
from composio.types import Tool

@schema_modifier(tools=["HACKERNEWS_GET_USER"])
def modify_schema(tool: str, toolkit: str, schema: Tool) -> Tool:
    # Perform modifications on the schema
    schema["description"] = "Enhanced HackerNews user lookup with additional features"
    schema["parameters"]["properties"]["include_karma"] = {
        "type": "boolean",
        "description": "Include user karma in response",
        "default": True
    }
    return schema

# Use the modifier when getting tools
tools = composio.tools.get(
    user_id="default",
    slug="HACKERNEWS_GET_USER",
    modifiers=[modify_schema]
)
```

### Execution Modifiers

Transform tool execution behavior with before and after execute modifiers:

```python
from composio import before_execute, after_execute
from composio.types import ToolExecuteParams, ToolExecutionResponse

@before_execute(tools=["HACKERNEWS_GET_USER"])
def before_execute_modifier(
    tool: str,
    toolkit: str, 
    params: ToolExecuteParams
) -> ToolExecuteParams:
    # Transform input before execution
    print(f"Executing {tool} with params: {params}")
    return params

@after_execute(tools=["HACKERNEWS_GET_USER"])
def after_execute_modifier(
    tool: str,
    toolkit: str,
    response: ToolExecutionResponse
) -> ToolExecutionResponse:
    # Transform output after execution
    return {
        **response,
        "data": {
            **response["data"],
            "processed_at": "2024-01-01T00:00:00Z"
        }
    }

# Execute tool with modifiers
response = composio.tools.execute(
    user_id="default",
    slug="HACKERNEWS_GET_USER", 
    arguments={"username": "pg"},
    modifiers=[before_execute_modifier, after_execute_modifier]
)
```

## Connected Accounts

Composio SDK provides a powerful way to manage third-party service connections through Connected Accounts. This feature allows you to authenticate with various services and maintain those connections.

### Creating a Connected Account

```python
from composio import Composio
from composio.types import auth_scheme

composio = Composio(api_key=os.getenv("COMPOSIO_API_KEY"))

# Create a connected account with OAuth
connection_request = composio.connected_accounts.initiate(
    user_id="user123",
    auth_config_id="ac_12343544",  # You can create it from the dashboard
    callback_url="https://your-app.com/callback",
    data={
        # Additional data for the connection
        "scope": ["read", "write"]
    }
)

# Wait for the connection to be established
# Default timeout is 60 seconds
connected_account = connection_request.wait_for_connection()
print(connected_account)
```

### API Key Authentication

```python
# Create a connected account with API Key
connection_request = composio.connected_accounts.initiate(
    user_id="user123", 
    auth_config_id="ac_12343544",
    config=auth_scheme.api_key(
        options={
            "api_key": "your-api-key-here"
        }
    )
)
```

### Managing Connected Accounts

```python
# List all connected accounts
accounts = composio.connected_accounts.list(user_id="user123")

# Get a specific connected account
account = composio.connected_accounts.get("account_id")

# Enable/Disable a connected account
composio.connected_accounts.enable("account_id")
composio.connected_accounts.disable("account_id")

# Refresh credentials
composio.connected_accounts.refresh("account_id")

# Delete a connected account
composio.connected_accounts.delete("account_id")
```

### Connection Statuses

Connected accounts can have the following statuses:

- `ACTIVE`: Connection is established and working
- `INACTIVE`: Connection is temporarily disabled  
- `PENDING`: Connection is being processed
- `INITIATED`: Connection request has started
- `EXPIRED`: Connection credentials have expired
- `FAILED`: Connection attempt failed

## Tools and Toolkits

### Working with Tools

```python
# Get tools by toolkit
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# Get tools by search
tools = composio.tools.get(user_id="default", search="user")

# Get tools by toolkit and search
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"], search="star")

# Execute a tool directly
response = composio.tools.execute(
    user_id="default",
    slug="HACKERNEWS_GET_USER",
    arguments={"username": "pg"}
)
print(response)
```

### Proxy Calls

Make direct API calls through connected accounts:

```python
# Execute proxy call (GitHub API)
proxy_response = composio.tools.proxy(
    endpoint="/repos/composiohq/composio/issues/1",
    method="GET", 
    connected_account_id="ac_1234",  # Use connected account for GitHub
    parameters=[
        {
            "name": "Accept",
            "value": "application/vnd.github.v3+json", 
            "type": "header"
        }
    ]
)
print(proxy_response)
```

## Authentication Schemes

Composio supports various authentication schemes:

- OAuth2
- OAuth1  
- OAuth1a
- API Key
- Basic Auth
- Bearer Token
- Google Service Account
- And more...

## Environment Variables

- `COMPOSIO_API_KEY`: Your Composio API key
- `COMPOSIO_BASE_URL`: Custom API base URL
- `COMPOSIO_LOGGING_LEVEL`: Logging level (silent, error, warn, info, debug)
- `DEVELOPMENT`: Development mode flag
- `COMPOSIO_TOOLKIT_VERSION_<TOOLKITNAME>`: Version of the specific toolkit
- `CI`: CI environment flag

## MCP (Model Context Protocol)

Create MCP servers for seamless integration with Claude, Cursor, and other MCP-compatible tools:

```python
from composio import Composio

composio = Composio()

# Create MCP server
mcp_server = composio.mcp.create(
    "my-mcp-server",
    toolkits=["github", "gmail"],
    manually_manage_connections=False
)

# Generate server instance for a user
server_instance = mcp_server.generate("user123")
print(f"MCP Server URL: {server_instance['url']}")
```

## Supported AI Frameworks

Composio provides dedicated integrations for popular AI frameworks:

- **OpenAI** - Direct integration with OpenAI's API
- **LangChain** - Tools and agents for LangChain workflows
- **LangGraph** - State machine workflows with LangGraph
- **CrewAI** - Multi-agent systems with CrewAI
- **AutoGen** - Microsoft's AutoGen framework
- **Anthropic** - Claude integration
- **Google AI** - Gemini and other Google AI services
- **LlamaIndex** - RAG and data framework integration

## Error Handling

```python
from composio import Composio
from composio.exceptions import ComposioError, ApiKeyNotProvidedError

try:
    composio = Composio()  # Will raise ApiKeyNotProvidedError if no API key
    tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])
except ApiKeyNotProvidedError:
    print("Please provide COMPOSIO_API_KEY environment variable")
except ComposioError as e:
    print(f"Composio error: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../CONTRIBUTING.md) for more details.

## License

Apache License 2.0

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
