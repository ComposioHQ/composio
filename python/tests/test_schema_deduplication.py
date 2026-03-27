from unittest.mock import Mock

from composio.client.types import Tool, tool_list_response
from composio.core.models.tools import Tools
from composio.utils.shared import deduplicate_required_fields


def create_mock_tool(
    slug: str = "TEST_TOOL",
    toolkit_slug: str = "github",
    input_required: list[str] | None = None,
    output_required: list[str] | None = None,
) -> Tool:
    return Tool(
        name=f"Test {slug}",
        slug=slug,
        description="Test tool",
        input_parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "filters": {
                    "type": "object",
                    "properties": {"owner": {"type": "string"}},
                    "required": ["owner", "owner"],
                },
            },
            "required": input_required or ["query", "query"],
        },
        output_parameters={
            "type": "object",
            "properties": {"results": {"type": "array", "items": {"type": "string"}}},
            "required": output_required or ["results", "results"],
        },
        available_versions=["v1.0.0"],
        version="v1.0.0",
        scopes=[],
        toolkit=tool_list_response.ItemToolkit(
            name=toolkit_slug.title(), slug=toolkit_slug, logo=""
        ),
        deprecated=tool_list_response.ItemDeprecated(
            available_versions=["v1.0.0"],
            displayName=f"Test {slug}",
            version="v1.0.0",
            toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
            is_deprecated=False,
        ),
        is_deprecated=False,
        no_auth=False,
        tags=[],
    )


def create_tools_instance(client: Mock) -> Tools:
    provider = Mock()
    provider.name = "test_provider"
    provider.set_execute_tool_fn = Mock()
    return Tools(client=client, provider=provider)


def test_deduplicate_required_fields_recurses_through_common_schema_keywords():
    schema = {
        "type": "object",
        "properties": {
            "config": {
                "type": "object",
                "required": ["mode", "mode"],
            }
        },
        "additionalProperties": {
            "type": "object",
            "required": ["enabled", "enabled"],
        },
        "$defs": {
            "nested": {
                "type": "object",
                "required": ["id", "id", "slug"],
            }
        },
        "prefixItems": [
            {
                "type": "object",
                "required": ["name", "name"],
            }
        ],
    }

    result = deduplicate_required_fields(schema)

    assert result["properties"]["config"]["required"] == ["mode"]
    assert result["additionalProperties"]["required"] == ["enabled"]
    assert result["$defs"]["nested"]["required"] == ["id", "slug"]
    assert result["prefixItems"][0]["required"] == ["name"]


def test_deduplicate_required_fields_preserves_order_and_does_not_mutate():
    original = {
        "type": "object",
        "required": ["c", "a", "b", "a", "c"],
    }

    result = deduplicate_required_fields(original)

    assert result["required"] == ["c", "a", "b"]
    assert original["required"] == ["c", "a", "b", "a", "c"]


def test_get_raw_composio_tool_by_slug_deduplicates_input_and_output_schemas():
    mock_client = Mock()
    mock_client.tools.retrieve.return_value = create_mock_tool()

    tools = create_tools_instance(mock_client)
    tool = tools.get_raw_composio_tool_by_slug("TEST_TOOL")

    assert tool.input_parameters["required"] == ["query"]
    assert tool.input_parameters["properties"]["filters"]["required"] == ["owner"]
    assert tool.output_parameters["required"] == ["results"]


def test_get_raw_composio_tool_by_slug_deduplicates_custom_tool_schema():
    mock_client = Mock()
    tools = create_tools_instance(mock_client)

    custom_tool_info = create_mock_tool(slug="CUSTOM_TOOL", toolkit_slug="custom")
    mock_custom_tool = Mock(info=custom_tool_info)
    tools._custom_tools.custom_tools_registry = {"CUSTOM_TOOL": mock_custom_tool}

    tool = tools.get_raw_composio_tool_by_slug("CUSTOM_TOOL")

    assert tool is not custom_tool_info
    assert tool.input_parameters["required"] == ["query"]
    assert tool.output_parameters["required"] == ["results"]
    assert custom_tool_info.input_parameters["required"] == ["query", "query"]
    assert custom_tool_info.output_parameters["required"] == ["results", "results"]


def test_get_raw_composio_tools_deduplicates_each_retrieved_tool():
    mock_client = Mock()
    mock_client.tools.list.return_value = Mock(
        items=[
            create_mock_tool(slug="TEST_TOOL_A"),
            create_mock_tool(slug="TEST_TOOL_B"),
        ]
    )

    tools = create_tools_instance(mock_client)
    result = tools.get_raw_composio_tools(tools=["TEST_TOOL_A", "TEST_TOOL_B"])

    assert [tool.input_parameters["required"] for tool in result] == [["query"], ["query"]]
    assert [tool.output_parameters["required"] for tool in result] == [
        ["results"],
        ["results"],
    ]


def test_get_raw_composio_tools_does_not_mutate_custom_tool_registry_schema():
    mock_client = Mock()
    tools = create_tools_instance(mock_client)

    custom_tool_info = create_mock_tool(slug="CUSTOM_TOOL", toolkit_slug="custom")
    mock_custom_tool = Mock(info=custom_tool_info)
    tools._custom_tools.custom_tools_registry = {"CUSTOM_TOOL": mock_custom_tool}

    result = tools.get_raw_composio_tools(tools=["CUSTOM_TOOL"])

    assert result[0] is not custom_tool_info
    assert result[0].input_parameters["required"] == ["query"]
    assert result[0].output_parameters["required"] == ["results"]
    assert custom_tool_info.input_parameters["required"] == ["query", "query"]
    assert custom_tool_info.output_parameters["required"] == ["results", "results"]


def test_get_raw_tool_router_meta_tools_deduplicates_session_tool_schemas():
    mock_client = Mock()
    mock_client.tool_router.session.tools.return_value = Mock(
        items=[create_mock_tool(slug="COMPOSIO_SEARCH_TOOLS")]
    )

    tools = create_tools_instance(mock_client)
    result = tools.get_raw_tool_router_meta_tools(session_id="session_123")

    assert result[0].input_parameters["required"] == ["query"]
    assert result[0].output_parameters["required"] == ["results"]
