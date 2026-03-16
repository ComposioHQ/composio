"""
Type inference verification for CUSTOM providers.

This test proves the new generic approach works for user-defined providers.
This is the KEY BENEFIT of the two-parameter generic approach over @overload:
custom providers get proper type inference without requiring any changes
to the Composio SDK.

Run: mypy tests/test_type_inference_custom_provider.py

Requirements:
    - composio (core SDK)
"""

from typing import TYPE_CHECKING, Sequence
import typing as t

from composio import Composio
from composio.client.types import Tool
from composio.core.provider.none_agentic import NonAgenticProvider

if TYPE_CHECKING:
    from typing_extensions import assert_type

# ============================================
# Custom provider defined by a hypothetical user
# ============================================


class MyCustomTool(t.TypedDict):
    """User's custom tool format."""

    name: str
    description: str
    parameters: dict


MyCustomToolCollection = t.List[MyCustomTool]


class MyCustomProvider(
    NonAgenticProvider[MyCustomTool, MyCustomToolCollection], name="my-custom"
):
    """User-defined custom provider."""

    def wrap_tool(self, tool: Tool) -> MyCustomTool:
        return MyCustomTool(
            name=tool.slug,
            description=tool.description or "",
            parameters=tool.input_parameters or {},
        )

    def wrap_tools(self, tools: Sequence[Tool]) -> MyCustomToolCollection:
        return [self.wrap_tool(tool) for tool in tools]


# ============================================
# Type inference tests
# ============================================


def test_custom_provider_type_inference() -> None:
    """Custom provider correctly infers return type.

    THIS IS THE KEY TEST: Custom providers get proper type inference
    without requiring any changes to the Composio SDK.
    """
    composio = Composio(provider=MyCustomProvider())
    tools = composio.tools.get(user_id="test", toolkits=["github"])

    if TYPE_CHECKING:
        # The return type should be inferred as list[MyCustomTool]
        assert_type(tools, list[MyCustomTool])


def test_custom_provider_explicit_annotation() -> None:
    """Custom provider works with explicit type annotation."""
    composio: Composio[MyCustomTool, MyCustomToolCollection] = Composio(
        provider=MyCustomProvider()
    )
    tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

    if TYPE_CHECKING:
        assert_type(tools, list[MyCustomTool])


def test_custom_provider_all_parameters() -> None:
    """Custom provider type inference works with all get() parameters."""
    composio = Composio(provider=MyCustomProvider())

    # Test different parameter combinations
    tools_by_toolkit = composio.tools.get(user_id="test", toolkits=["github"])
    tools_by_slug = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")
    tools_by_search = composio.tools.get(user_id="test", search="repository")
    tools_by_list = composio.tools.get(user_id="test", tools=["GITHUB_CREATE_REPO"])

    if TYPE_CHECKING:
        assert_type(tools_by_toolkit, list[MyCustomTool])
        assert_type(tools_by_slug, list[MyCustomTool])
        assert_type(tools_by_search, list[MyCustomTool])
        assert_type(tools_by_list, list[MyCustomTool])


def test_custom_provider_tools_attribute_type() -> None:
    """Verify the tools attribute has correct type."""
    from composio.core.models.tools import Tools

    composio = Composio(provider=MyCustomProvider())

    if TYPE_CHECKING:
        # The tools attribute should be Tools[MyCustomTool, list[MyCustomTool]]
        assert_type(composio.tools, Tools[MyCustomTool, list[MyCustomTool]])
