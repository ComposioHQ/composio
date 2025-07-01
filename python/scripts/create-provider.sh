#!/bin/bash

# Check if provider name is provided
if [ -z "$1" ]; then
    echo "Please provide a provider name"
    echo "Usage: ./scripts/create-provider.sh <provider-name> [--agentic]"
    exit 1
fi

PROVIDER_NAME=$1
PROVIDER_PATH="python/providers/$PROVIDER_NAME"
CAPITAL_PROVIDER_NAME="$(tr '[:lower:]' '[:upper:]' <<< ${PROVIDER_NAME:0:1})${PROVIDER_NAME:1}"
PACKAGE_NAME="composio_$PROVIDER_NAME"

# Check if provider should be agentic
IS_AGENTIC=false
if [ "$2" = "--agentic" ]; then
    IS_AGENTIC=true
fi

# Check if provider directory already exists
if [ -d "$PROVIDER_PATH" ]; then
    echo "❌ Provider '$PROVIDER_NAME' already exists in $PROVIDER_PATH"
    exit 1
fi

# Create directory structure
mkdir -p "$PROVIDER_PATH/$PACKAGE_NAME"

# Create pyproject.toml
cat > "$PROVIDER_PATH/pyproject.toml" << EOL
[tool.poetry]
name = "$PACKAGE_NAME"
version = "0.1.0"
description = "${IS_AGENTIC:+Agentic }Provider for ${CAPITAL_PROVIDER_NAME} in Composio SDK"
authors = ["Your Name <you@example.com>"]
readme = "README.md"
packages = [{include = "$PACKAGE_NAME"}]

[tool.poetry.dependencies]
python = ">=3.10,<4"
composio = "*"

[tool.poetry.group.dev.dependencies]
pytest = "^8.3.2"
ruff = "^0.5.7"
mypy = "^1.11.1"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
EOL

# Create setup.py for backwards compatibility
cat > "$PROVIDER_PATH/setup.py" << EOL
from setuptools import setup, find_packages

setup(
    name="$PACKAGE_NAME",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "composio>=0.1.0",
    ],
    python_requires=">=3.10,<4",
    author="Your Name",
    author_email="you@example.com",
    description="${IS_AGENTIC:+Agentic }Provider for ${CAPITAL_PROVIDER_NAME} in Composio SDK",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/composio/composio",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
EOL

# Create __init__.py
cat > "$PROVIDER_PATH/$PACKAGE_NAME/__init__.py" << EOL
"""
${CAPITAL_PROVIDER_NAME} Provider for composio SDK.
"""

from .provider import ${CAPITAL_PROVIDER_NAME}Provider

__all__ = ["${CAPITAL_PROVIDER_NAME}Provider"]
EOL

# Create provider.py
if [ "$IS_AGENTIC" = true ]; then
cat > "$PROVIDER_PATH/$PACKAGE_NAME/provider.py" << EOL
"""
${CAPITAL_PROVIDER_NAME} Provider implementation.
"""

from typing import List, Sequence, Dict, Any, Callable
from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool


# Define your tool format
class ${CAPITAL_PROVIDER_NAME}Tool:
    """${CAPITAL_PROVIDER_NAME} tool format"""
    def __init__(self, name: str, description: str, execute: Callable, schema: dict):
        self.name = name
        self.description = description
        self.execute = execute
        self.schema = schema


# Define your tool collection format
class ${CAPITAL_PROVIDER_NAME}Toolkit:
    """${CAPITAL_PROVIDER_NAME} toolkit format"""
    def __init__(self, tools: List[${CAPITAL_PROVIDER_NAME}Tool]):
        self.tools = tools
    
    def create_agent(self, config: dict) -> Any:
        """Create an agent using the tools"""
        # TODO: Implement agent creation logic
        raise NotImplementedError("Agent creation not implemented yet")


class ${CAPITAL_PROVIDER_NAME}Provider(
    AgenticProvider[${CAPITAL_PROVIDER_NAME}Tool, ${CAPITAL_PROVIDER_NAME}Toolkit],
    name="${PROVIDER_NAME}"
):
    """
    Composio toolset for ${CAPITAL_PROVIDER_NAME} framework.
    """

    def wrap_tool(
        self, 
        tool: Tool, 
        execute_tool: AgenticProviderExecuteFn
    ) -> ${CAPITAL_PROVIDER_NAME}Tool:
        """Wrap a tool in the ${PROVIDER_NAME} format."""
        def execute_wrapper(**kwargs) -> Dict:
            result = execute_tool(tool.slug, kwargs)
            if not result.get("successful", False):
                raise Exception(result.get("error", "Tool execution failed"))
            return result.get("data", {})
        
        return ${CAPITAL_PROVIDER_NAME}Tool(
            name=tool.slug,
            description=tool.description or "",
            execute=execute_wrapper,
            schema=tool.input_parameters
        )

    def wrap_tools(
        self,
        tools: Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn
    ) -> ${CAPITAL_PROVIDER_NAME}Toolkit:
        """
        Get composio tools wrapped as ${CAPITAL_PROVIDER_NAME} toolkit.
        """
        wrapped_tools = [self.wrap_tool(tool, execute_tool) for tool in tools]
        return ${CAPITAL_PROVIDER_NAME}Toolkit(tools=wrapped_tools)
EOL
else
cat > "$PROVIDER_PATH/$PACKAGE_NAME/provider.py" << EOL
"""
${CAPITAL_PROVIDER_NAME} Provider implementation.
"""

from typing import List, Optional, Sequence, TypeAlias
from composio.core.provider import NonAgenticProvider
from composio.types import Tool, Modifiers, ToolExecutionResponse


# Define your tool format
class ${CAPITAL_PROVIDER_NAME}Tool:
    """${CAPITAL_PROVIDER_NAME} tool format"""
    def __init__(self, name: str, description: str, parameters: dict):
        self.name = name
        self.description = description
        self.parameters = parameters


# Define your tool collection format
${CAPITAL_PROVIDER_NAME}ToolCollection: TypeAlias = List[${CAPITAL_PROVIDER_NAME}Tool]


class ${CAPITAL_PROVIDER_NAME}Provider(
    NonAgenticProvider[${CAPITAL_PROVIDER_NAME}Tool, ${CAPITAL_PROVIDER_NAME}ToolCollection],
    name="${PROVIDER_NAME}"
):
    """
    Composio toolset for ${CAPITAL_PROVIDER_NAME} platform.
    """

    def wrap_tool(self, tool: Tool) -> ${CAPITAL_PROVIDER_NAME}Tool:
        """Transform a single tool to platform format"""
        return ${CAPITAL_PROVIDER_NAME}Tool(
            name=tool.slug,
            description=tool.description or "",
            parameters={
                "type": "object",
                "properties": tool.input_parameters.get("properties", {}),
                "required": tool.input_parameters.get("required", [])
            }
        )

    def wrap_tools(self, tools: Sequence[Tool]) -> ${CAPITAL_PROVIDER_NAME}ToolCollection:
        """Transform a collection of tools"""
        return [self.wrap_tool(tool) for tool in tools]

    def execute_tool_call(
        self,
        user_id: str,
        tool_call: dict,
        modifiers: Optional[Modifiers] = None
    ) -> ToolExecutionResponse:
        """
        Execute a tool call.

        :param user_id: User ID to use for executing function calls.
        :param tool_call: Tool call metadata containing 'name' and 'arguments'.
        :param modifiers: Modifiers to use for executing function calls.
        :return: Object containing output data from the tool call.
        """
        return self.execute_tool(
            slug=tool_call["name"],
            arguments=tool_call["arguments"],
            modifiers=modifiers,
            user_id=user_id
        )

    def handle_tool_calls(
        self,
        user_id: str,
        response: Any,
        modifiers: Optional[Modifiers] = None
    ) -> List[ToolExecutionResponse]:
        """
        Handle tool calls from ${CAPITAL_PROVIDER_NAME} response.

        :param response: Response object from ${CAPITAL_PROVIDER_NAME}
        :param user_id: User ID to use for executing function calls.
        :param modifiers: Modifiers to use for executing function calls.
        :return: A list of output objects from the tool calls.
        """
        # TODO: Implement based on ${CAPITAL_PROVIDER_NAME}'s response format
        raise NotImplementedError("Tool call handling not implemented yet")
EOL
fi

# Create py.typed marker for PEP 561
touch "$PROVIDER_PATH/$PACKAGE_NAME/py.typed"

# Create demo script
if [ "$IS_AGENTIC" = true ]; then
cat > "$PROVIDER_PATH/${PROVIDER_NAME}_demo.py" << EOL
"""
${CAPITAL_PROVIDER_NAME} demo.
"""

from $PACKAGE_NAME import ${CAPITAL_PROVIDER_NAME}Provider
from composio import Composio

# Initialize tools.
composio = Composio(provider=${CAPITAL_PROVIDER_NAME}Provider())

# Define task.
task = "Star a repo composiohq/composio on GitHub"

# Get GitHub tools that are pre-configured
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# TODO: Implement agent execution with ${CAPITAL_PROVIDER_NAME}
print(f"Got {len(tools)} tools for the task: {task}")
print("Implement your ${CAPITAL_PROVIDER_NAME} agent logic here!")
EOL
else
cat > "$PROVIDER_PATH/${PROVIDER_NAME}_demo.py" << EOL
"""
${CAPITAL_PROVIDER_NAME} demo.
"""

from $PACKAGE_NAME import ${CAPITAL_PROVIDER_NAME}Provider
from composio import Composio

# Initialize tools.
composio = Composio(provider=${CAPITAL_PROVIDER_NAME}Provider())

# Define task.
task = "Star a repo composiohq/composio on GitHub"

# Get GitHub tools that are pre-configured
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# TODO: Create ${CAPITAL_PROVIDER_NAME} client and use the tools
print(f"Got {len(tools)} tools for the task: {task}")

# Example tool execution (implement based on ${CAPITAL_PROVIDER_NAME}'s API)
# result = composio.provider.execute_tool_call(
#     user_id="default",
#     tool_call={"name": "GITHUB_STAR_REPO", "arguments": {...}}
# )
# print(result)
EOL
fi

# Create README.md
cat > "$PROVIDER_PATH/README.md" << EOL
# $PACKAGE_NAME

${IS_AGENTIC:+Agentic }Provider for ${CAPITAL_PROVIDER_NAME} in Composio SDK.

## Features

${IS_AGENTIC:+- **Full Tool Execution**: Execute tools with proper parameter handling
- **Agent Support**: Create agents with wrapped tools
- **Type Safety**: Full type annotations for better IDE support}${!IS_AGENTIC:+- **Tool Transformation**: Convert Composio tools to ${CAPITAL_PROVIDER_NAME} format
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full type annotations for better IDE support}

## Installation

\`\`\`bash
pip install $PACKAGE_NAME
# or
poetry add $PACKAGE_NAME
# or
uv add $PACKAGE_NAME
\`\`\`

## Quick Start

\`\`\`python
from composio import Composio
from $PACKAGE_NAME import ${CAPITAL_PROVIDER_NAME}Provider

# Initialize Composio with ${CAPITAL_PROVIDER_NAME} provider
composio = Composio(
    api_key="your-composio-api-key",
    provider=${CAPITAL_PROVIDER_NAME}Provider()
)

# Get available tools
tools = composio.tools.get(
    user_id="default",
    toolkits=["github", "gmail"]
)

# Use tools with ${CAPITAL_PROVIDER_NAME}
# TODO: Add your usage example here
\`\`\`

## Usage Examples

### Basic Example

\`\`\`python
from composio import Composio
from $PACKAGE_NAME import ${CAPITAL_PROVIDER_NAME}Provider

# Initialize provider
provider = ${CAPITAL_PROVIDER_NAME}Provider()

# Initialize Composio
composio = Composio(
    api_key="your-api-key",
    provider=provider
)

# Get tools
tools = composio.tools.get(
    user_id="default", 
    toolkits=["github"]
)

${IS_AGENTIC:+# Create agent with tools
agent = tools.create_agent({})

# Run agent
result = agent.run("Star the composiohq/composio repository")
print(result)}${!IS_AGENTIC:+# Execute a tool
result = provider.execute_tool_call(
    user_id="default",
    tool_call={
        "name": "GITHUB_STAR_REPO",
        "arguments": {
            "owner": "composiohq",
            "repo": "composio"
        }
    }
)
print(result)}
\`\`\`

## API Reference

### ${CAPITAL_PROVIDER_NAME}Provider Class

The \`${CAPITAL_PROVIDER_NAME}Provider\` class extends \`${IS_AGENTIC:+AgenticProvider}${!IS_AGENTIC:+NonAgenticProvider}\` and provides ${PROVIDER_NAME}-specific functionality.

#### Methods

##### \`wrap_tool(tool: Tool${IS_AGENTIC:+, execute_tool: AgenticProviderExecuteFn}) -> ${CAPITAL_PROVIDER_NAME}Tool\`

Wraps a tool in the ${PROVIDER_NAME} format.

\`\`\`python
tool = provider.wrap_tool(composio_tool${IS_AGENTIC:+, execute_tool})
\`\`\`

##### \`wrap_tools(tools: Sequence[Tool]${IS_AGENTIC:+, execute_tool: AgenticProviderExecuteFn}) -> ${IS_AGENTIC:+${CAPITAL_PROVIDER_NAME}Toolkit}${!IS_AGENTIC:+${CAPITAL_PROVIDER_NAME}ToolCollection}\`

Wraps multiple tools in the ${PROVIDER_NAME} format.

\`\`\`python
tools = provider.wrap_tools(composio_tools${IS_AGENTIC:+, execute_tool})
\`\`\`

${!IS_AGENTIC:+##### \`execute_tool_call(user_id: str, tool_call: dict, modifiers: Optional[Modifiers] = None) -> ToolExecutionResponse\`

Executes a tool call.

\`\`\`python
result = provider.execute_tool_call(
    user_id="default",
    tool_call={"name": "TOOL_NAME", "arguments": {...}}
)
\`\`\`}

## Development

1. Clone the repository
2. Install dependencies: \`uv sync\` or \`poetry install\`
3. Make your changes
4. Run tests: \`pytest\`
5. Format code: \`ruff format\`
6. Lint code: \`ruff check\`

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
EOL

# Make the script executable
chmod +x "$PROVIDER_PATH/${PROVIDER_NAME}_demo.py"

echo "✨ Created new ${IS_AGENTIC:+agentic }provider at $PROVIDER_PATH"
echo "✨ Provider structure:"
echo "   📁 $PROVIDER_PATH/"
echo "   ├── 📄 README.md"
echo "   ├── 📄 pyproject.toml"
echo "   ├── 📄 setup.py"
echo "   ├── 📄 ${PROVIDER_NAME}_demo.py"
echo "   └── 📁 $PACKAGE_NAME/"
echo "       ├── 📄 __init__.py"
echo "       ├── 📄 provider.py"
echo "       └── 📄 py.typed"
echo ""
echo "🚀 Next steps:"
echo "   1. cd $PROVIDER_PATH"
echo "   2. Update provider.py with your implementation"
echo "   3. Install in development mode: uv pip install -e ."
echo "   4. Test your provider: python ${PROVIDER_NAME}_demo.py"