"""Test Gemini provider functionality.

Verifies:
- Provider initialization and attributes
- wrap_tool returns Python callables with correct metadata
- wrap_tools returns list of callables
- Callables are AFC-compatible (work with google-genai's function map)
- handle_response dispatches function calls via stored executors (backward compat)
- _process_execution_result helper
"""

import inspect
from unittest.mock import MagicMock, Mock

import pytest

from composio.client.types import Tool, tool_list_response
from composio.core.models.base import allow_tracking
from composio.core.provider import AgenticProvider

try:
    import composio_gemini as _composio_gemini  # noqa: F401

    HAS_COMPOSIO_GEMINI = True
except ImportError:
    HAS_COMPOSIO_GEMINI = False

try:
    from google.genai import types as genai_types

    HAS_GENAI = True
except ImportError:
    genai_types = None  # type: ignore[assignment]
    HAS_GENAI = False

pytestmark = [
    pytest.mark.gemini,
    pytest.mark.skipif(
        not HAS_COMPOSIO_GEMINI, reason="composio_gemini package not installed"
    ),
]

requires_genai = pytest.mark.skipif(
    not HAS_GENAI, reason="google-genai package not installed"
)


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


def create_mock_tool(
    slug: str,
    toolkit_slug: str,
    version: str = "12012025_00",
    input_parameters: dict | None = None,
    description: str = "Test tool for provider testing",
) -> Tool:
    """Create a mock tool for testing."""
    return Tool(
        name=f"Test {slug}",
        slug=slug,
        description=description,
        input_parameters=input_parameters
        or {"type": "object", "properties": {}, "required": []},
        output_parameters={},
        available_versions=[version],
        version=version,
        scopes=[],
        status="active",
        toolkit=tool_list_response.ItemToolkit(
            name=toolkit_slug.title(), slug=toolkit_slug, logo=""
        ),
        deprecated=tool_list_response.ItemDeprecated(
            available_versions=[version],
            displayName=f"Test {slug}",
            version=version,
            toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
            is_deprecated=False,
        ),
        is_deprecated=False,
        no_auth=False,
        tags=[],
    )


def create_mock_execute_tool():
    """Create a mock execute_tool function matching AgenticProviderExecuteFn."""
    mock_fn = Mock()
    mock_fn.return_value = {
        "data": {"result": "success"},
        "error": None,
        "successful": True,
    }
    return mock_fn


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


class TestGeminiProviderInitialization:
    def test_initialization(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        assert provider is not None
        assert provider.name == "gemini"
        assert isinstance(provider, AgenticProvider)

    def test_has_empty_executors_on_init(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        assert provider._executors == {}


# ---------------------------------------------------------------------------
# wrap_tool – callable creation
# ---------------------------------------------------------------------------


class TestWrapTool:
    def test_returns_callable(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool("GITHUB_STAR_REPO", "github")
        result = provider.wrap_tool(tool, create_mock_execute_tool())
        assert callable(result)
        assert inspect.isfunction(result)

    def test_callable_has_correct_name(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool("GITHUB_STAR_REPO", "github")
        result = provider.wrap_tool(tool, create_mock_execute_tool())
        assert result.__name__ == "GITHUB_STAR_REPO"

    def test_callable_has_correct_doc(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "GITHUB_STAR_REPO", "github", description="Star a GitHub repository"
        )
        result = provider.wrap_tool(tool, create_mock_execute_tool())
        assert result.__doc__ == "Star a GitHub repository"

    def test_callable_has_typed_signature(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "GITHUB_CREATE_ISSUE",
            "github",
            input_parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "body": {"type": "string"},
                },
                "required": ["title"],
            },
        )
        result = provider.wrap_tool(tool, create_mock_execute_tool())

        sig = inspect.signature(result)
        assert "title" in sig.parameters
        assert "body" in sig.parameters
        assert sig.parameters["title"].annotation is str
        assert sig.parameters["body"].annotation is str

    def test_callable_has_annotations(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "TEST_TOOL",
            "test",
            input_parameters={
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
        )
        result = provider.wrap_tool(tool, create_mock_execute_tool())

        assert "name" in result.__annotations__
        assert result.__annotations__["name"] is str
        assert result.__annotations__["return"] is dict

    def test_stores_executor(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool("GITHUB_STAR_REPO", "github")
        execute_tool = create_mock_execute_tool()
        provider.wrap_tool(tool, execute_tool)

        assert "GITHUB_STAR_REPO" in provider._executors
        assert provider._executors["GITHUB_STAR_REPO"] is execute_tool

    def test_callable_executes_correctly(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "MY_TOOL",
            "test",
            input_parameters={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        )
        execute_tool = create_mock_execute_tool()
        func = provider.wrap_tool(tool, execute_tool)

        result = func(query="hello")
        execute_tool.assert_called_once_with("MY_TOOL", {"query": "hello"})
        # _process_execution_result extracts data when successful
        assert result == {"result": "success"}

    def test_callable_processes_error_result(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "MY_TOOL",
            "test",
            input_parameters={
                "type": "object",
                "properties": {"q": {"type": "string"}},
                "required": [],
            },
        )
        execute_tool = Mock()
        execute_tool.return_value = {
            "data": {},
            "error": "Auth failed",
            "successful": False,
        }
        func = provider.wrap_tool(tool, execute_tool)
        result = func(q="test")
        assert result["error"] == "Auth failed"

    def test_callable_converts_pydantic_args_to_dicts(self):
        """AFC may pass Pydantic GeneratedModel instances as kwargs; they must be
        converted to plain dicts before reaching execute_tool so the Composio
        API can JSON-serialize them.
        """
        from pydantic import BaseModel

        from composio_gemini import GeminiProvider

        class FakeQuery(BaseModel):
            use_case: str = ""
            known_fields: str = ""

        provider = GeminiProvider()
        tool = create_mock_tool(
            "COMPOSIO_SEARCH_TOOLS",
            "composio",
            input_parameters={
                "type": "object",
                "properties": {
                    "queries": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "title": "Query",
                            "properties": {
                                "use_case": {"type": "string"},
                                "known_fields": {"type": "string"},
                            },
                        },
                    },
                },
                "required": [],
            },
        )
        execute_tool = create_mock_execute_tool()
        func = provider.wrap_tool(tool, execute_tool)

        # Simulate what the SDK does: pass Pydantic model instances
        func(queries=[FakeQuery(use_case="summarize email")])

        call_args = execute_tool.call_args[0][1]
        # The queries value must be a plain list of dicts, not Pydantic models
        assert isinstance(call_args["queries"], list)
        assert isinstance(call_args["queries"][0], dict)
        assert call_args["queries"][0]["use_case"] == "summarize email"

    def test_array_param_has_parameterized_type(self):
        """Array parameters must produce List[X], not bare List.

        The google-genai SDK rejects bare List because it generates
        {"type": "ARRAY"} without "items".
        """
        import typing

        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "TOOL_WITH_ARRAY",
            "test",
            input_parameters={
                "type": "object",
                "properties": {
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "name": {"type": "string"},
                },
                "required": ["name"],
            },
        )
        func = provider.wrap_tool(tool, create_mock_execute_tool())

        sig = inspect.signature(func)
        tags_annotation = sig.parameters["tags"].annotation
        # Must be a parameterized generic like List[str], not bare list
        assert typing.get_origin(tags_annotation) is list
        assert typing.get_args(tags_annotation) != ()

    def test_reserved_keyword_handling(self):
        """Parameters named 'for' or 'async' are substituted and reinstated."""
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "TOOL_WITH_RESERVED",
            "test",
            input_parameters={
                "type": "object",
                "properties": {
                    "for": {"type": "string"},
                    "name": {"type": "string"},
                },
                "required": [],
            },
        )
        execute_tool = create_mock_execute_tool()
        func = provider.wrap_tool(tool, execute_tool)

        # The callable's signature should use the cleaned name
        sig = inspect.signature(func)
        assert "for_rs" in sig.parameters
        assert "for" not in sig.parameters

        # When called with the cleaned name, it reinstates the original
        func(for_rs="test_value", name="hello")
        call_args = execute_tool.call_args
        assert call_args[0][1]["for"] == "test_value"
        assert call_args[0][1]["name"] == "hello"

    def test_wrap_same_tool_twice_does_not_corrupt_schema(self):
        """Wrapping the same Tool object twice must not corrupt the schema."""
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "TOOL_RESERVED",
            "test",
            input_parameters={
                "type": "object",
                "properties": {
                    "for": {"type": "string"},
                    "name": {"type": "string"},
                },
                "required": ["for"],
            },
        )
        execute_tool = create_mock_execute_tool()

        func1 = provider.wrap_tool(tool, execute_tool)
        func2 = provider.wrap_tool(tool, execute_tool)

        # Both callables must have the cleaned parameter
        sig1 = inspect.signature(func1)
        sig2 = inspect.signature(func2)
        assert "for_rs" in sig1.parameters
        assert "for_rs" in sig2.parameters

        # Original tool schema must be unchanged
        assert "for" in tool.input_parameters["properties"]
        assert "for_rs" not in tool.input_parameters["properties"]

    def test_reserved_keyword_stays_required(self):
        """A reserved keyword listed in 'required' must remain required after renaming."""
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "TOOL_REQUIRED_RESERVED",
            "test",
            input_parameters={
                "type": "object",
                "properties": {
                    "for": {"type": "string"},
                    "name": {"type": "string"},
                },
                "required": ["for", "name"],
            },
        )
        func = provider.wrap_tool(tool, create_mock_execute_tool())

        sig = inspect.signature(func)
        # Both params should be required (no default value)
        assert sig.parameters["for_rs"].default is inspect.Parameter.empty
        assert sig.parameters["name"].default is inspect.Parameter.empty


# ---------------------------------------------------------------------------
# wrap_tools
# ---------------------------------------------------------------------------


class TestWrapTools:
    def test_returns_list_of_callables(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tools = [
            create_mock_tool("GITHUB_STAR_REPO", "github"),
            create_mock_tool("GMAIL_SEND_EMAIL", "gmail"),
        ]
        result = provider.wrap_tools(tools, create_mock_execute_tool())

        assert len(result) == 2
        assert all(inspect.isfunction(f) for f in result)

    def test_stores_all_executors(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tools = [
            create_mock_tool("GITHUB_STAR_REPO", "github"),
            create_mock_tool("GMAIL_SEND_EMAIL", "gmail"),
        ]
        provider.wrap_tools(tools, create_mock_execute_tool())

        assert "GITHUB_STAR_REPO" in provider._executors
        assert "GMAIL_SEND_EMAIL" in provider._executors

    def test_empty_list(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        result = provider.wrap_tools([], create_mock_execute_tool())
        assert result == []


# ---------------------------------------------------------------------------
# AFC compatibility (requires google-genai)
# ---------------------------------------------------------------------------


@requires_genai
class TestAFCCompatibility:
    """Verify callables work with google-genai's AFC pipeline."""

    def _wrap_one_tool(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool(
            "GITHUB_STAR_REPO",
            "github",
            input_parameters={
                "type": "object",
                "properties": {
                    "owner": {"type": "string"},
                    "repo": {"type": "string"},
                },
                "required": ["owner", "repo"],
            },
            description="Star a GitHub repository",
        )
        func = provider.wrap_tool(tool, create_mock_execute_tool())
        return func

    def test_callable_is_function(self):
        """inspect.isfunction must be True for t_tool() to call from_callable."""
        func = self._wrap_one_tool()
        assert inspect.isfunction(func)

    def test_callable_not_afc_incompatible(self):
        """Callables should not be flagged as AFC-incompatible."""
        func = self._wrap_one_tool()
        # The SDK checks: isinstance(tool, types.Tool) and tool.function_declarations
        # A callable is not a types.Tool, so it should not be flagged.
        assert not isinstance(func, genai_types.Tool)

    def test_callable_enters_function_map(self):
        """The callable should appear in the function map built by the SDK."""
        func = self._wrap_one_tool()
        # Simulate what get_function_map does: callable(tool) -> function_map[tool.__name__]
        assert callable(func)
        function_map = {}
        if callable(func):
            function_map[func.__name__] = func
        assert "GITHUB_STAR_REPO" in function_map

    def test_callables_in_generate_content_config(self):
        """Wrapped callables can be passed to GenerateContentConfig without error."""
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tools = [
            create_mock_tool(
                "GITHUB_STAR_REPO",
                "github",
                input_parameters={
                    "type": "object",
                    "properties": {
                        "owner": {"type": "string"},
                        "repo": {"type": "string"},
                    },
                    "required": ["owner", "repo"],
                },
            ),
        ]
        wrapped = provider.wrap_tools(tools, create_mock_execute_tool())

        # This should not raise
        config = genai_types.GenerateContentConfig(tools=wrapped)
        assert config.tools is not None
        assert len(config.tools) == 1


# ---------------------------------------------------------------------------
# handle_response (backward compat)
# ---------------------------------------------------------------------------


@requires_genai
class TestHandleResponse:
    def _create_mock_response(self, function_calls: list[tuple[str, dict]]):
        parts = []
        for name, args in function_calls:
            part = MagicMock()
            part.function_call = MagicMock()
            part.function_call.name = name
            part.function_call.args = args
            parts.append(part)

        response = MagicMock()
        response.candidates = [MagicMock()]
        response.candidates[0].content = MagicMock()
        response.candidates[0].content.parts = parts
        return response

    def test_executes_function_call(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        tool = create_mock_tool("GITHUB_STAR_REPO", "github")
        execute_tool = create_mock_execute_tool()
        provider.wrap_tools([tool], execute_tool)

        response = self._create_mock_response(
            [("GITHUB_STAR_REPO", {"repo": "composio/composio"})]
        )
        function_responses, executed = provider.handle_response(response)

        assert executed is True
        assert len(function_responses) == 1
        execute_tool.assert_called_once_with(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
        )

    def test_no_function_calls(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        response = MagicMock()
        response.candidates = [MagicMock()]
        text_part = MagicMock()
        text_part.function_call = None
        response.candidates[0].content = MagicMock()
        response.candidates[0].content.parts = [text_part]

        function_responses, executed = provider.handle_response(response)
        assert executed is False
        assert function_responses == []

    def test_unknown_function_name(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        response = self._create_mock_response([("UNKNOWN_TOOL", {"param": "value"})])
        function_responses, executed = provider.handle_response(response)
        assert executed is False
        assert function_responses == []

    def test_no_candidates(self):
        from composio_gemini import GeminiProvider

        provider = GeminiProvider()
        response = MagicMock()
        response.candidates = []
        function_responses, executed = provider.handle_response(response)
        assert executed is False
        assert function_responses == []


# ---------------------------------------------------------------------------
# _process_execution_result
# ---------------------------------------------------------------------------


class TestProcessExecutionResult:
    def test_non_dict_result(self):
        from composio_gemini.provider import _process_execution_result

        assert _process_execution_result("hello") == {"result": "hello"}
        assert _process_execution_result(42) == {"result": 42}

    def test_successful_with_dict_data(self):
        from composio_gemini.provider import _process_execution_result

        result = _process_execution_result(
            {"data": {"key": "value"}, "error": None, "successful": True}
        )
        assert result == {"key": "value"}

    def test_successful_with_non_dict_data(self):
        from composio_gemini.provider import _process_execution_result

        result = _process_execution_result(
            {"data": "plain text", "error": None, "successful": True}
        )
        assert result == {"result": "plain text"}

    def test_failed_result(self):
        from composio_gemini.provider import _process_execution_result

        result = _process_execution_result(
            {"data": {}, "error": "Something went wrong", "successful": False}
        )
        assert result["error"] == "Something went wrong"

    def test_passthrough_dict(self):
        from composio_gemini.provider import _process_execution_result

        result = _process_execution_result({"custom": "response"})
        assert result == {"custom": "response"}
