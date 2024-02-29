import json
from typing import Dict, Any, List, Union, Type
import logging
import requests
from inspect import Parameter, Signature
import types

from llama_index.core.tools.tool_spec.base import BaseToolSpec

logger = logging.getLogger(__name__)

BASE_URL = "https://hermes-production-6901.up.railway.app/api"

def map_composio_type_to_python(type_spec) -> Type:
    if isinstance(type_spec, dict):
        type_str = type_spec.get('type')
        if type_str == 'string':
            return str
        elif type_str == 'number':
            return float if '.' in str(type_spec.get('example', '')) else int
        elif type_str == 'boolean':
            return bool
        # elif type_str == 'object':
        #     properties = type_spec.get('properties', {})
        #     required = type_spec.get('required', [])
        #     return Dict[str, Union[*tuple(map_composio_type_to_python(prop) for prop in properties.values()), Any]] if properties else Dict[str, Any]
        # elif type_str == 'array':
        #     items_spec = type_spec.get('items', {})
        #     return List[map_composio_type_to_python(items_spec)] if items_spec else List[Any]
        # Add more mappings as necessary
    # Fallback or default type
    return Any  # Using Any for unspecified or complex types

class ComposioToolSpec(BaseToolSpec):
    """Generic tool spec based on composio_tool.json schema."""

    def __init__(self, tool_schema: str, composio_token: str, user_id: str) -> None:
        """Initialize with composio tool schema."""
        self.tool_schema = json.loads(tool_schema)
        self.spec_functions = self._generate_spec_functions()

    def _generate_spec_functions(self) -> List[str]:
        """Generate spec functions based on the tools actions."""
        spec_functions = []
        for tool in self.tool_schema.get("tools", []):
            for action in tool.get("Actions", []):
                function_name = tool["name"] + "_" + action["Id"]
                spec_functions.append(function_name)
                input_params = action["Signature"]["Input"]["properties"]
                print("input_params:", input_params)
                setattr(self, function_name, self._create_function(tool["name"], action["Id"], function_name, action["Description"], input_params, action["Signature"]["Input"].get("required", [])))
        return spec_functions

    def _create_function(self, tool_name: str, action_id: str, function_name: str, description: str, input_params: Dict[str, Any], required_params: List[str] = []):
        """Create a function for the given action with typed arguments."""

        # Function template that uses **kwargs to accept any arguments and performs an actual API call.
        def template_function(**kwargs) -> Dict[str, Any]:
            missing_params = [param for param in input_params if param not in kwargs and param in required_params]
            if missing_params:
                return {"error": f"Missing required params: {missing_params}"}
            params = {param: kwargs[param] for param in input_params if param in kwargs}
            logger.info(f"Executing action {action_id} with {params}")
            
            request_body = json.dumps(params)
            response = requests.post(f"{BASE_URL}/{tool_name}/{action_id}", data=request_body, headers={'Content-Type': 'application/json'})
            return response.json()

        parameters = [
            Parameter(
                name=param, 
                kind=Parameter.POSITIONAL_OR_KEYWORD, 
                annotation=map_composio_type_to_python(input_params[param]), 
                # default=Parameter.empty if param in required_params else Parameter.default
            )
            for param in input_params
        ]
        new_sig = Signature(parameters, return_annotation=Dict[str, Any])

        func = types.FunctionType(template_function.__code__, globals(), name=function_name, closure=template_function.__closure__)

        # Assign the new signature to the function.
        func.__signature__ = new_sig
        func.__doc__ = description

        return func
