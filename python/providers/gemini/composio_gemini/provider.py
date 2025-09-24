import types
import typing as t
from inspect import Signature

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.openapi import function_signature_from_jsonschema

# Import Google GenAI types for native tool declaration
try:
    from google.genai import types as genai_types
except ImportError:
    genai_types = None  # type: ignore


class GeminiToolWrapper:
    """Wrapper that acts as both a FunctionDeclaration and a callable function."""
    
    def __init__(self, function_declaration, execute_fn, tool_slug, annotations=None):
        self.declaration = function_declaration
        self.execute_fn = execute_fn
        self.__name__ = tool_slug
        self.__doc__ = function_declaration.description
        
        # Make it look like a FunctionDeclaration to Gemini
        self.name = function_declaration.name
        self.description = function_declaration.description
        self.parameters = function_declaration.parameters
        
        # Add annotations for inspection
        self.__annotations__ = annotations or {}
        
        # Create a simple signature for inspection
        from inspect import Parameter, Signature
        params = [Parameter(name="kwargs", kind=Parameter.VAR_KEYWORD)]
        self.__signature__ = Signature(parameters=params)
        
    def __call__(self, **kwargs):
        """Make it callable for automatic function execution."""
        return self.execute_fn(**kwargs)
    
    def to_proto(self):
        """Convert to proto for Gemini API - delegate to the declaration."""
        return self.declaration.to_proto()
    
    def __repr__(self):
        return f"<GeminiToolWrapper: {self.name}>"


class GeminiProvider(AgenticProvider[t.Callable, list[t.Callable]], name="gemini"):
    """
    Composio toolset for Google AI Python Gemini framework.
    """

    __schema_skip_defaults__ = True

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
        # If genai_types is available, use native declaration
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
            
            # Create simple annotations for the wrapper
            annotations = {}
            for param_name in properties.keys():
                # Use simple types for annotations
                param_type = properties[param_name].get("type", "STRING")
                if param_type == "STRING":
                    annotations[param_name] = str
                elif param_type == "INTEGER":
                    annotations[param_name] = int
                elif param_type == "NUMBER":
                    annotations[param_name] = float
                elif param_type == "BOOLEAN":
                    annotations[param_name] = bool
                elif param_type == "ARRAY":
                    annotations[param_name] = list
                elif param_type == "OBJECT":
                    annotations[param_name] = dict
                else:
                    annotations[param_name] = t.Any
            annotations["return"] = dict
            
            # Wrap the FunctionDeclaration in a Tool object as required by Gemini
            genai_tool = genai_types.Tool(function_declarations=[function_declaration])
            
            # Add attributes for compatibility and inspection
            setattr(genai_tool, "_execute", lambda **kwargs: execute_tool(slug=tool.slug, arguments=kwargs))
            setattr(genai_tool, "__name__", tool.slug)
            setattr(genai_tool, "__doc__", tool.description)
            setattr(genai_tool, "__annotations__", annotations)
            
            # Add a __call__ method for automatic execution (if supported)
            def call_method(self, **kwargs):
                return self._execute(**kwargs)
            setattr(genai_tool, "__call__", types.MethodType(call_method, genai_tool))
            
            # Add signature for inspection
            from inspect import Parameter, Signature
            params = [Parameter(name="kwargs", kind=Parameter.VAR_KEYWORD)]
            setattr(genai_tool, "__signature__", Signature(parameters=params))
            
            return genai_tool
        
        # Fallback to original implementation for backward compatibility
        docstring = tool.description
        docstring += "\nArgs:"
        for _param, _schema in tool.input_parameters["properties"].items():  # type: ignore
            docstring += "\n    "
            docstring += _param + ": " + _schema.get("description", _param.title())

        docstring += "\nReturns:"
        docstring += "\n    A dictionary containing response from the action"

        def _execute(**kwargs: t.Any) -> t.Dict:
            return execute_tool(slug=tool.slug, arguments=kwargs)

        function = types.FunctionType(
            code=_execute.__code__,
            name=tool.slug,
            globals=globals(),
            closure=_execute.__closure__,
        )
        parameters = function_signature_from_jsonschema(
            schema=tool.input_parameters,
            skip_default=self.skip_default,
        )
        setattr(function, "__signature__", Signature(parameters=parameters))
        setattr(
            function,
            "__annotations__",
            {p.name: p.annotation for p in parameters} | {"return": dict},
        )
        function.__doc__ = docstring
        return function

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[t.Callable]:
        """Get composio tools wrapped as Google Genai SDK compatible function calling object."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
