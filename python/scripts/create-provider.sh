#!/bin/bash

# Check if provider name is provided
if [ -z "$1" ]; then
    echo "Please provide a provider name"
    echo "Usage: ./scripts/create-provider.sh <provider-name> [--agentic] [--output-dir <directory>]"
    exit 1
fi

PROVIDER_NAME=$1
shift

# Default output directory
OUTPUT_DIR="python/providers"
IS_AGENTIC=false

# Parse optional arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --agentic)
            IS_AGENTIC=true
            shift
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./scripts/create-provider.sh <provider-name> [--agentic] [--output-dir <directory>]"
            exit 1
            ;;
    esac
done

PROVIDER_PATH="$OUTPUT_DIR/$PROVIDER_NAME"
# Convert to title case (e.g., myai -> Myai)
TITLE_CASE_PROVIDER_NAME="$(tr '[:lower:]' '[:upper:]' <<< ${PROVIDER_NAME:0:1})${PROVIDER_NAME:1}"
PACKAGE_NAME="composio_$PROVIDER_NAME"

# Check if provider directory already exists
if [ -d "$PROVIDER_PATH" ]; then
    echo "❌ Provider '$PROVIDER_NAME' already exists in $PROVIDER_PATH"
    exit 1
fi

# Create directory structure
mkdir -p "$PROVIDER_PATH/$PACKAGE_NAME"

# Create pyproject.toml
cat > "$PROVIDER_PATH/pyproject.toml" << EOL
[project]
name = "$PACKAGE_NAME"
version = "0.1.0"
description = "${IS_AGENTIC:+Agentic }Provider for ${TITLE_CASE_PROVIDER_NAME} in the Composio SDK"
readme = "README.md"
requires-python = ">=3.10,<4"
authors = [
    { name = "Composio", email = "tech@composio.dev" }
]
classifiers = [
    "Programming Language :: Python :: 3",
    "License :: OSI Approved :: Apache Software License",
    "Operating System :: OS Independent",
]
dependencies = [
    "composio",
]

[project.urls]
Homepage = "https://github.com/ComposioHQ/composio"
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
    description="${IS_AGENTIC:+Agentic }Provider for ${TITLE_CASE_PROVIDER_NAME} in the Composio SDK",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/composio/composio",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: Apache Software License",
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
${TITLE_CASE_PROVIDER_NAME} Provider for composio SDK.
"""

from .provider import ${TITLE_CASE_PROVIDER_NAME}Provider

__all__ = ["${TITLE_CASE_PROVIDER_NAME}Provider"]
EOL

# Create provider.py
if [ "$IS_AGENTIC" = true ]; then
cat > "$PROVIDER_PATH/$PACKAGE_NAME/provider.py" << EOL
"""
${TITLE_CASE_PROVIDER_NAME} Provider implementation.
"""

from __future__ import annotations

import typing as t

from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.types import Tool


# Define your tool format
class ${TITLE_CASE_PROVIDER_NAME}Tool:
    """${TITLE_CASE_PROVIDER_NAME} tool format"""
    def __init__(self, name: str, description: str, execute: t.Callable, schema: dict):
        self.name = name
        self.description = description
        self.execute = execute
        self.schema = schema


class ${TITLE_CASE_PROVIDER_NAME}Provider(
    AgenticProvider[${TITLE_CASE_PROVIDER_NAME}Tool, t.List[${TITLE_CASE_PROVIDER_NAME}Tool]],
    name="${PROVIDER_NAME}"
):
    """
    Composio toolset for ${TITLE_CASE_PROVIDER_NAME} framework.
    """

    def wrap_tool(
        self, 
        tool: Tool, 
        execute_tool: AgenticProviderExecuteFn
    ) -> ${TITLE_CASE_PROVIDER_NAME}Tool:
        """Wrap a tool in the ${PROVIDER_NAME} format."""
        def execute_wrapper(**kwargs) -> t.Dict:
            result = execute_tool(tool.slug, kwargs)
            if not result.get("successful", False):
                raise Exception(result.get("error", "Tool execution failed"))
            return result.get("data", {})
        
        return ${TITLE_CASE_PROVIDER_NAME}Tool(
            name=tool.slug,
            description=tool.description or "",
            execute=execute_wrapper,
            schema=tool.input_parameters
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn
    ) -> t.List[${TITLE_CASE_PROVIDER_NAME}Tool]:
        """
        Get composio tools wrapped as a list of ${TITLE_CASE_PROVIDER_NAME} tools.
        """
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
EOL
else
cat > "$PROVIDER_PATH/$PACKAGE_NAME/provider.py" << EOL
"""
${TITLE_CASE_PROVIDER_NAME} Provider implementation.
"""

from __future__ import annotations

import typing as t

from composio.core.provider import NonAgenticProvider
from composio.types import Tool, Modifiers, ToolExecutionResponse


# Define your tool format
class ${TITLE_CASE_PROVIDER_NAME}Tool:
    """${TITLE_CASE_PROVIDER_NAME} tool format"""
    def __init__(self, name: str, description: str, parameters: dict):
        self.name = name
        self.description = description
        self.parameters = parameters


# Define your tool collection format
${TITLE_CASE_PROVIDER_NAME}ToolCollection: t.TypeAlias = t.List[${TITLE_CASE_PROVIDER_NAME}Tool]


class ${TITLE_CASE_PROVIDER_NAME}Provider(
    NonAgenticProvider[${TITLE_CASE_PROVIDER_NAME}Tool, ${TITLE_CASE_PROVIDER_NAME}ToolCollection],
    name="${PROVIDER_NAME}"
):
    """
    Composio toolset for ${TITLE_CASE_PROVIDER_NAME} platform.
    """

    def wrap_tool(self, tool: Tool) -> ${TITLE_CASE_PROVIDER_NAME}Tool:
        """Transform a single tool to platform format"""
        return ${TITLE_CASE_PROVIDER_NAME}Tool(
            name=tool.slug,
            description=tool.description or "",
            parameters={
                "type": "object",
                "properties": tool.input_parameters.get("properties", {}),
                "required": tool.input_parameters.get("required", [])
            }
        )

    def wrap_tools(self, tools: t.Sequence[Tool]) -> ${TITLE_CASE_PROVIDER_NAME}ToolCollection:
        """Transform a collection of tools"""
        return [self.wrap_tool(tool) for tool in tools]

    def execute_tool_call(
        self,
        user_id: str,
        tool_call: dict,
        modifiers: t.Optional[Modifiers] = None
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
        response: t.Union[dict, t.Any],
        modifiers: t.Optional[Modifiers] = None
    ) -> t.List[ToolExecutionResponse]:
        """
        Handle tool calls from ${TITLE_CASE_PROVIDER_NAME} response.

        :param response: Response object from ${TITLE_CASE_PROVIDER_NAME}
        :param user_id: User ID to use for executing function calls.
        :param modifiers: Modifiers to use for executing function calls.
        :return: A list of output objects from the tool calls.
        """
        # TODO: Implement based on ${TITLE_CASE_PROVIDER_NAME}'s response format
        # Example:
        # outputs = []
        # for tool_call in response.tool_calls:
        #     outputs.append(
        #         self.execute_tool_call(
        #             user_id=user_id,
        #             tool_call=tool_call,
        #             modifiers=modifiers,
        #         )
        #     )
        # return outputs
        raise NotImplementedError("Tool call handling not implemented yet")
EOL
fi

# Create py.typed marker for PEP 561
touch "$PROVIDER_PATH/$PACKAGE_NAME/py.typed"

# Create demo script
if [ "$IS_AGENTIC" = true ]; then
cat > "$PROVIDER_PATH/${PROVIDER_NAME}_demo.py" << EOL
"""
${TITLE_CASE_PROVIDER_NAME} demo.
"""

import asyncio

# from ${PROVIDER_NAME}_framework import Agent, Runner  # Import your agent framework
from composio_${PROVIDER_NAME} import ${TITLE_CASE_PROVIDER_NAME}Provider

from composio import Composio

# Initialize Composio toolset
composio = Composio(provider=${TITLE_CASE_PROVIDER_NAME}Provider())

# Get all the tools
tools = composio.tools.get(
    user_id="default",
    tools=["GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"],
)

# TODO: Create an agent with the tools
# agent = Agent(
#     name="GitHub Agent",
#     instructions="You are a helpful assistant that helps users with GitHub tasks.",
#     tools=tools,
# )


# Run the agent
async def main():
    # TODO: Implement your agent execution logic
    # result = await Runner.run(
    #     starting_agent=agent,
    #     input=(
    #         "Star the repository composiohq/composio on GitHub. If done "
    #         "successfully, respond with 'Action executed successfully'"
    #     ),
    # )
    # print(result.final_output)
    
    print("Implement your ${TITLE_CASE_PROVIDER_NAME} agent logic here!")
    print(f"Got {len(tools)} tools:")
    for tool in tools:
        print(f"  - {tool.name}: {tool.description}")


asyncio.run(main())
EOL
else
cat > "$PROVIDER_PATH/${PROVIDER_NAME}_demo.py" << EOL
"""
${TITLE_CASE_PROVIDER_NAME} demo.
"""

from composio_${PROVIDER_NAME} import ${TITLE_CASE_PROVIDER_NAME}Provider
# from ${PROVIDER_NAME} import ${TITLE_CASE_PROVIDER_NAME}  # Import your AI client

from composio import Composio

# Initialize tools.
# ${PROVIDER_NAME}_client = ${TITLE_CASE_PROVIDER_NAME}()  # Initialize your AI client
composio = Composio(provider=${TITLE_CASE_PROVIDER_NAME}Provider())

# Define task.
task = "Star a repo composiohq/composio on GitHub"

# Get GitHub tools that are pre-configured
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# TODO: Get response from the LLM
# response = ${PROVIDER_NAME}_client.chat.completions.create(
#     model="your-model",
#     tools=tools,
#     messages=[
#         {"role": "system", "content": "You are a helpful assistant."},
#         {"role": "user", "content": task},
#     ],
# )
# print(response)

# TODO: Execute the function calls.
# result = composio.provider.handle_tool_calls(response=response, user_id="default")
# print(result)

print(f"Got {len(tools)} tools for the task: {task}")
for tool in tools:
    print(f"  - {tool.name}: {tool.description}")
print("\nImplement your ${TITLE_CASE_PROVIDER_NAME} integration here!")
EOL
fi

# Create README.md
cat > "$PROVIDER_PATH/README.md" << EOL
# $PACKAGE_NAME

${IS_AGENTIC:+Agentic }Provider for ${TITLE_CASE_PROVIDER_NAME} in the Composio SDK.

## Features

${IS_AGENTIC:+- **Full Tool Execution**: Execute tools with proper parameter handling
- **Agent Support**: Create agents with wrapped tools
- **Type Safety**: Full type annotations for better IDE support}${!IS_AGENTIC:+- **Tool Transformation**: Convert Composio tools to ${TITLE_CASE_PROVIDER_NAME} format
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full type annotations for better IDE support}

## Installation

\`\`\`bash
pip install $PACKAGE_NAME
# or
uv add $PACKAGE_NAME
\`\`\`

## Quick Start

\`\`\`python
from composio import Composio
from composio_${PROVIDER_NAME} import ${TITLE_CASE_PROVIDER_NAME}Provider

# Initialize Composio with ${TITLE_CASE_PROVIDER_NAME} provider
composio = Composio(
    api_key="your-composio-api-key",
    provider=${TITLE_CASE_PROVIDER_NAME}Provider()
)

# Get available tools
tools = composio.tools.get(
    user_id="default",
    toolkits=["github", "gmail"]
)

# Use tools with ${TITLE_CASE_PROVIDER_NAME}
# TODO: Add your usage example here
\`\`\`

## Usage Examples

### Basic Example

\`\`\`python
from composio import Composio
from composio_${PROVIDER_NAME} import ${TITLE_CASE_PROVIDER_NAME}Provider

# Initialize provider
provider = ${TITLE_CASE_PROVIDER_NAME}Provider()

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

${IS_AGENTIC:+# Use the tools with your agent framework
# TODO: Implement your agent logic here
for tool in tools:
    print(f"Tool: {tool.name} - {tool.description}")}${!IS_AGENTIC:+# TODO: Get response from your AI platform (example)
# response = ${PROVIDER_NAME}_client.chat.completions.create(
#     model="your-model",
#     tools=tools,
#     messages=[
#         {"role": "system", "content": "You are a helpful assistant."},
#         {"role": "user", "content": "Star the composiohq/composio repository"},
#     ],
# )
# 
# # Execute the function calls
# result = composio.provider.handle_tool_calls(response=response, user_id="default")
# print(result)}
\`\`\`

## API Reference

### ${TITLE_CASE_PROVIDER_NAME}Provider Class

The \`${TITLE_CASE_PROVIDER_NAME}Provider\` class extends \`${IS_AGENTIC:+AgenticProvider}${!IS_AGENTIC:+NonAgenticProvider}\` and provides ${PROVIDER_NAME}-specific functionality.

#### Methods

##### \`wrap_tool(tool: Tool${IS_AGENTIC:+, execute_tool: AgenticProviderExecuteFn}) -> ${TITLE_CASE_PROVIDER_NAME}Tool\`

Wraps a tool in the ${PROVIDER_NAME} format.

\`\`\`python
tool = provider.wrap_tool(composio_tool${IS_AGENTIC:+, execute_tool})
\`\`\`

##### \`wrap_tools(tools: Sequence[Tool]${IS_AGENTIC:+, execute_tool: AgenticProviderExecuteFn}) -> ${IS_AGENTIC:+${TITLE_CASE_PROVIDER_NAME}Toolkit}${!IS_AGENTIC:+${TITLE_CASE_PROVIDER_NAME}ToolCollection}\`

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
2. Install dependencies: \`uv sync\`
3. Make your changes
4. Run tests: \`pytest\`
5. Format code: \`ruff format\`
6. Lint code: \`ruff check\`

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

Apache License 2.0

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