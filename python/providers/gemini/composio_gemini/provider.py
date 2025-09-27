"""Composio Google AI Python SDK Integration."""

import types
import typing as t

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn

# Import Google GenAI types for native tool declaration
from google.genai import types as genai_types


class CallableGeminiTool:
    """
    A wrapper that acts as both a Gemini Tool and a callable function.
    This enables automatic function calling while maintaining compatibility.
    """
    
    def __init__(self, function_declaration, execute_fn, tool_slug):
        # Store the actual Tool object for Gemini
        self._tool = genai_types.Tool(function_declarations=[function_declaration])
        
        # Store execution function
        self._execute_fn = execute_fn
        
        # Make it look like a Tool to Gemini
        self.function_declarations = [function_declaration]
        
        # Make it inspectable like a function
        self.__name__ = tool_slug
        self.__doc__ = function_declaration.description
        
    def __call__(self, **kwargs):
        """This makes automatic function calling work!"""
        return self._execute_fn(**kwargs)
    
    def _execute(self, **kwargs):
        """Manual execution method for backward compatibility."""
        return self._execute_fn(**kwargs)
    
    def to_proto(self):
        """Convert to proto for Gemini API."""
        return self._tool.to_proto()
    
    def __repr__(self):
        return f"<CallableGeminiTool: {self.__name__}>"


class GeminiProvider(AgenticProvider[t.Callable, list[t.Callable]], name="gemini"):
    """
    Composio toolset for Google AI Python Gemini framework.
    """

    __schema_skip_defaults__ = True
    
    # Note: We always use native Tools for compatibility with gemini-2.5-pro
    # Python functions don't work due to missing schema details (items field for arrays)

    def _convert_schema_to_genai_schema(self, json_schema: dict) -> dict:
        """Convert JSON schema to Google GenAI compatible schema format."""
        schema_type = json_schema.get("type", "string")
        
        # Map JSON schema types to GenAI types
        type_mapping = {
            "string": "STRING",
            "integer": "INTEGER", 
            "number": "NUMBER",
            "boolean": "BOOLEAN",
            "array": "ARRAY",
            "object": "OBJECT",
        }
        
        result = {
            "type": type_mapping.get(schema_type, "STRING"),
        }
        
        # Add description if present
        if "description" in json_schema:
            result["description"] = json_schema["description"]
        
        # Handle array types - must include items
        if schema_type == "array" and "items" in json_schema:
            result["items"] = self._convert_schema_to_genai_schema(json_schema["items"])
        elif schema_type == "array":
            # Default items schema if not specified
            result["items"] = {"type": "STRING"}
        
        # Handle object types
        if schema_type == "object" and "properties" in json_schema:
            result["properties"] = {
                k: self._convert_schema_to_genai_schema(v)
                for k, v in json_schema["properties"].items()
            }
            if "required" in json_schema:
                result["required"] = json_schema["required"]
        
        # Handle enum/literal types
        if "enum" in json_schema:
            result["enum"] = json_schema["enum"]
        
        return result

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> t.Callable:
        """Wraps composio tool as Google Genai SDK compatible function calling object."""
        # Always use native Tools for gemini-2.5-pro compatibility
        if genai_types is not None:
            # Convert tool parameters to GenAI schema format
            properties = {}
            required = []
            
            for param_name, param_schema in tool.input_parameters.get("properties", {}).items():  # type: ignore
                properties[param_name] = self._convert_schema_to_genai_schema(param_schema)
                
                # Check if parameter is required
                if param_name in tool.input_parameters.get("required", []):  # type: ignore
                    required.append(param_name)
            
            # Create native GenAI function declaration
            function_declaration = genai_types.FunctionDeclaration(
                name=tool.slug,
                description=tool.description,
                parameters=genai_types.Schema(
                    type="OBJECT",
                    properties=properties,
                    required=required,
                )
            )
            
            # Create our callable wrapper
            def execute_fn(**kwargs):
                return execute_tool(slug=tool.slug, arguments=kwargs)
            
            # Return the callable wrapper that acts as both Tool and function
            return CallableGeminiTool(function_declaration, execute_fn, tool.slug)
        
        # Fallback if genai_types is not available (should not happen with current SDK)
        raise ImportError(
            "google.genai.types is required for Gemini provider. "
            "Please ensure you have the latest google-genai SDK installed."
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[t.Callable]:
        """Get composio tools wrapped as Google Genai SDK compatible function calling object."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
