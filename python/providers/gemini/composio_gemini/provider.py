"""Gemini provider for Composio SDK."""

import typing as t

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn

# Try to import Google GenAI types
try:
    from google.genai import types as genai_types

    HAS_GENAI = True
except ImportError:
    genai_types = None  # type: ignore
    HAS_GENAI = False


class GeminiTool:
    """
    Enhanced Gemini Tool wrapper that handles automatic function execution.
    Acts as a drop-in replacement for genai_types.Tool with execution support.
    """

    def __init__(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
        function_declaration: t.Optional[t.Any] = None,
    ):
        self.tool = tool
        self.execute_tool = execute_tool
        self.function_declaration = function_declaration

        # Create the actual Gemini Tool if we have genai support
        self._genai_tool = None
        if HAS_GENAI and function_declaration:
            self._genai_tool = genai_types.Tool(
                function_declarations=[function_declaration]
            )

        # Store executor for easy access
        self._executors = {tool.slug: self}

        # Copy function attributes for compatibility
        self.__name__ = tool.slug
        self.__module__ = "composio_gemini"
        self.__doc__ = tool.description

    def __call__(self, **kwargs: t.Any) -> t.Dict:
        """Execute the tool when called."""
        result = self.execute_tool(slug=self.tool.slug, arguments=kwargs)

        # Process the result for Gemini
        if not isinstance(result, dict):
            return {"result": result}

        # Extract data field if present and successful
        if result.get("successful", True) and "data" in result:
            data = result["data"]
            return data if isinstance(data, dict) else {"result": data}

        # Return error info if failed
        if not result.get("successful", True):
            return {
                "error": result.get("error", "Tool execution failed"),
                "details": result,
            }

        return result

    @property
    def function_declarations(self):
        """Pass through to the underlying Gemini tool."""
        return self._genai_tool.function_declarations if self._genai_tool else []

    def to_dict(self):
        """Convert to dict for Gemini API."""
        return self._genai_tool.to_dict() if self._genai_tool else {}


class GeminiProvider(AgenticProvider[t.Any, list[t.Any]], name="gemini"):
    """
    Composio toolset for Google AI Python Gemini framework.
    Supports automatic function calling with native Gemini tools.
    """

    __schema_skip_defaults__ = True

    def _json_to_genai_schema(self, json_schema: dict) -> t.Optional[t.Any]:
        """Convert JSON Schema to GenAI Schema format, handling composite types."""
        if not HAS_GENAI:
            return None

        # Handle composite types (patterns from openapi.py)
        if "oneOf" in json_schema:
            # Gemini doesn't support unions directly, use first valid schema
            # This is a limitation but better than failing
            return self._json_to_genai_schema(json_schema["oneOf"][0])

        if "anyOf" in json_schema:
            # Similar to oneOf
            return self._json_to_genai_schema(json_schema["anyOf"][0])

        if "allOf" in json_schema:
            # Merge all schemas (pattern from openapi.py's _all_of_to_parameter)
            merged = {}
            for subschema in json_schema["allOf"]:
                merged.update(subschema)
            return self._json_to_genai_schema(merged)

        # Handle enum independently (can appear with or without type)
        if "enum" in json_schema:
            return self._handle_enum_schema(json_schema)

        schema_type = json_schema.get("type", "string")

        # Map type handlers
        type_handlers = {
            "array": self._handle_array_schema,
            "object": self._handle_object_schema,
            "string": self._handle_string_schema,
            "number": lambda _: genai_types.Schema(type=genai_types.Type.NUMBER),
            "integer": lambda _: genai_types.Schema(type=genai_types.Type.INTEGER),
            "boolean": lambda _: genai_types.Schema(type=genai_types.Type.BOOLEAN),
            "null": lambda _: genai_types.Schema(
                type=genai_types.Type.STRING
            ),  # Gemini doesn't have null type
        }

        handler = type_handlers.get(
            schema_type, lambda _: genai_types.Schema(type=genai_types.Type.STRING)
        )
        return handler(json_schema)

    def _handle_array_schema(self, json_schema: dict) -> t.Any:
        """Handle array type schema conversion."""
        items = json_schema.get("items", {})
        return genai_types.Schema(
            type=genai_types.Type.ARRAY,
            items=self._json_to_genai_schema(items)
            if items
            else genai_types.Schema(type=genai_types.Type.STRING),
        )

    def _handle_object_schema(self, json_schema: dict) -> t.Any:
        """Handle object type schema conversion."""
        properties = {
            name: schema_obj
            for name, schema in json_schema.get("properties", {}).items()
            if (schema_obj := self._json_to_genai_schema(schema)) is not None
        }
        return genai_types.Schema(
            type=genai_types.Type.OBJECT,
            properties=properties,
            required=json_schema.get("required", []),
        )

    def _handle_string_schema(self, json_schema: dict) -> t.Any:
        """Handle string type schema conversion."""
        if enum_values := json_schema.get("enum"):
            return genai_types.Schema(type=genai_types.Type.STRING, enum=enum_values)
        return genai_types.Schema(type=genai_types.Type.STRING)

    def _handle_enum_schema(self, json_schema: dict) -> t.Any:
        """Handle enum schema conversion (pattern from openapi.py)."""
        # Enum can be of any type, default to string if no type specified
        base_type = json_schema.get("type", "string")
        type_map = {
            "string": genai_types.Type.STRING,
            "integer": genai_types.Type.INTEGER,
            "number": genai_types.Type.NUMBER,
        }
        schema_type = type_map.get(base_type, genai_types.Type.STRING)
        return genai_types.Schema(type=schema_type, enum=json_schema["enum"])

    def _create_function_declaration(self, tool: Tool) -> t.Optional[t.Any]:
        """Create a native Gemini FunctionDeclaration if possible."""
        if not HAS_GENAI:
            return None

        try:
            genai_schema = self._json_to_genai_schema(tool.input_parameters)
            return genai_types.FunctionDeclaration(
                name=tool.slug,
                description=tool.description or f"Execute {tool.slug}",
                parameters=genai_schema,
            )
        except Exception as e:
            print(f"Warning: Could not create FunctionDeclaration for {tool.slug}: {e}")
            return None

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> GeminiTool:
        """Wrap a Composio tool for Gemini compatibility."""
        # Create native FunctionDeclaration
        function_declaration = self._create_function_declaration(tool)

        # Return the GeminiTool wrapper
        return GeminiTool(
            tool=tool,
            execute_tool=execute_tool,
            function_declaration=function_declaration,
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[GeminiTool]:
        """Wrap multiple tools for Gemini compatibility."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]

    @staticmethod
    def handle_response(response, tools: list[GeminiTool]) -> tuple[list, bool]:
        """
        Automatically handle function calls in a Gemini response.

        Args:
            response: The response from Gemini chat
            tools: The list of GeminiTool objects passed to the chat

        Returns:
            tuple: (function_responses, executed) where function_responses are ready
                   to send back and executed is True if functions were executed
        """
        # Check if we have a valid response with candidates
        if not (hasattr(response, "candidates") and response.candidates):
            return [], False

        candidate = response.candidates[0]
        if not (hasattr(candidate, "content") and candidate.content.parts):
            return [], False

        # Build executor map from tools
        executors = {}
        for tool in tools:
            if isinstance(tool, GeminiTool):
                executors.update(tool._executors)

        # Process function calls
        function_responses = []
        executed = False

        for part in candidate.content.parts:
            if not (hasattr(part, "function_call") and part.function_call):
                continue

            fc = part.function_call
            if fc.name not in executors:
                continue

            # Execute the function
            executor = executors[fc.name]
            result = executor(**fc.args)

            # Create function response
            if HAS_GENAI:
                function_responses.append(
                    genai_types.Part(
                        function_response=genai_types.FunctionResponse(
                            name=fc.name, response=result
                        )
                    )
                )
            executed = True

        return function_responses, executed
