import types
import typing as t
from inspect import Signature

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.openapi import function_signature_from_jsonschema

# Try to import genai types for native support
try:
    from google.genai import types as genai_types

    HAS_GENAI = True
except ImportError:
    genai_types = None  # type: ignore
    HAS_GENAI = False


class GeminiTool:
    """
    Enhanced Gemini Tool wrapper that handles automatic function execution.
    Acts as a drop-in replacement for genai_types.Tool but with execution support.
    """

    def __init__(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
        function: t.Callable,
        function_declaration: t.Any,
    ):
        self.tool = tool
        self.execute_tool = execute_tool
        self.function = function
        self.function_declaration = function_declaration

        # Create the actual Gemini Tool
        if HAS_GENAI and function_declaration:
            self._genai_tool = genai_types.Tool(
                function_declarations=[function_declaration]
            )
        else:
            self._genai_tool = None

        # Store executors for easy access
        self._executors = {tool.slug: self}

        # Copy function attributes for compatibility
        self.__name__ = function.__name__
        self.__module__ = function.__module__
        self.__doc__ = function.__doc__

    def __call__(self, **kwargs: t.Any) -> t.Dict:
        """Execute the tool when called."""
        result = self.execute_tool(slug=self.tool.slug, arguments=kwargs)

        # Process the result for Gemini
        if isinstance(result, dict):
            if "data" in result and result.get("successful", True):
                return (
                    result["data"]
                    if isinstance(result["data"], dict)
                    else {"result": result["data"]}
                )
            if not result.get("successful", True):
                return {
                    "error": result.get("error", "Tool execution failed"),
                    "details": result,
                }
            return result
        return {"result": result}

    @property
    def function_declarations(self):
        """Pass through to the underlying Gemini tool."""
        if self._genai_tool:
            return self._genai_tool.function_declarations
        return []

    def to_dict(self):
        """Convert to dict for Gemini API."""
        if self._genai_tool:
            return self._genai_tool.to_dict()
        return {}


class GeminiProvider(AgenticProvider[t.Any, list[t.Any]], name="gemini"):
    """
    Composio toolset for Google AI Python Gemini framework.
    Supports both automatic function calling and manual execution.
    """

    __schema_skip_defaults__ = True

    def _convert_schema_to_genai_schema(self, json_schema: dict) -> t.Any:
        """Convert JSON Schema to GenAI Schema format."""
        if not HAS_GENAI:
            return None

        schema_type = json_schema.get("type", "string")

        # Handle different types
        if schema_type == "array":
            items = json_schema.get("items", {})
            return genai_types.Schema(
                type=genai_types.Type.ARRAY,
                items=self._convert_schema_to_genai_schema(items)
                if items
                else genai_types.Schema(type=genai_types.Type.STRING),
            )
        elif schema_type == "object":
            properties = {}
            for prop_name, prop_schema in json_schema.get("properties", {}).items():
                properties[prop_name] = self._convert_schema_to_genai_schema(
                    prop_schema
                )

            return genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties=properties,
                required=json_schema.get("required", []),
            )
        elif schema_type == "string":
            enum_values = json_schema.get("enum")
            schema_dict = {"type": genai_types.Type.STRING}
            if enum_values:
                schema_dict["enum"] = enum_values
            return genai_types.Schema(**schema_dict)
        elif schema_type == "number":
            return genai_types.Schema(type=genai_types.Type.NUMBER)
        elif schema_type == "integer":
            return genai_types.Schema(type=genai_types.Type.INTEGER)
        elif schema_type == "boolean":
            return genai_types.Schema(type=genai_types.Type.BOOLEAN)
        else:
            # Default to string for unknown types
            return genai_types.Schema(type=genai_types.Type.STRING)

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> t.Any:
        """Wraps composio tool as Google Genai SDK compatible function calling object."""

        tool_slug = tool.slug

        # Build the docstring
        docstring = tool.description or f"Execute {tool_slug}"
        docstring += "\n\nArgs:"

        properties = tool.input_parameters.get("properties", {})
        required = set(tool.input_parameters.get("required", []))

        for param_name, param_schema in properties.items():
            param_desc = param_schema.get("description", "")
            is_required = param_name in required
            req_str = " (required)" if is_required else ""
            docstring += f"\n    {param_name}: {param_desc}{req_str}"

        docstring += "\n\nReturns:\n    dict: Response from the action"

        # Create the Python function for manual calling
        def tool_function(**kwargs: t.Any) -> t.Dict:
            """Execute the Composio tool."""
            result = execute_tool(slug=tool_slug, arguments=kwargs)

            if isinstance(result, dict):
                if "data" in result and result.get("successful", True):
                    return (
                        result["data"]
                        if isinstance(result["data"], dict)
                        else {"result": result["data"]}
                    )
                if not result.get("successful", True):
                    return {
                        "error": result.get("error", "Tool execution failed"),
                        "details": result,
                    }
                return result
            return {"result": result}

        # Create the function with proper metadata
        function = types.FunctionType(
            tool_function.__code__,
            tool_function.__globals__,
            tool_slug,
            tool_function.__defaults__,
            tool_function.__closure__,
        )

        function.__module__ = "composio_gemini"
        function.__name__ = tool_slug
        function.__qualname__ = tool_slug
        function.__doc__ = docstring

        # Get proper parameter signatures
        parameters = function_signature_from_jsonschema(
            schema=tool.input_parameters,
            skip_default=self.skip_default,
        )

        function.__signature__ = Signature(parameters=parameters)

        annotations = {}
        for param in parameters:
            annotations[param.name] = param.annotation
        annotations["return"] = t.Dict[str, t.Any]
        function.__annotations__ = annotations

        # Create native FunctionDeclaration if genai is available
        function_declaration = None
        if HAS_GENAI:
            try:
                # Convert the schema to GenAI format
                genai_schema = self._convert_schema_to_genai_schema(
                    tool.input_parameters
                )

                function_declaration = genai_types.FunctionDeclaration(
                    name=tool_slug,
                    description=tool.description or f"Execute {tool_slug}",
                    parameters=genai_schema,
                )
            except Exception as e:
                # Fallback to function-only mode if declaration fails
                print(
                    f"Warning: Could not create FunctionDeclaration for {tool_slug}: {e}"
                )
                pass

        # Return the GeminiTool wrapper
        return GeminiTool(
            tool=tool,
            execute_tool=execute_tool,
            function=function,
            function_declaration=function_declaration,
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[t.Any]:
        """Get composio tools wrapped as Google Genai SDK compatible function calling objects."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]

    @staticmethod
    def handle_response(response, tools):
        """
        Automatically handle function calls in a Gemini response.

        Args:
            response: The response from Gemini chat
            tools: The list of GeminiTool objects passed to the chat

        Returns:
            tuple: (function_responses, executed) where function_responses are ready to send back
                   and executed is True if functions were executed
        """
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

        function_responses = []
        executed = False

        for part in candidate.content.parts:
            if hasattr(part, "function_call") and part.function_call:
                fc = part.function_call

                # Execute the function
                if fc.name in executors:
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
