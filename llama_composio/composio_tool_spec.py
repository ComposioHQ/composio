import json
from typing import Dict, Any, List
import requests
import logging

logger = logging.getLogger(__name__)

def map_composio_type_to_python(type_spec):
    if isinstance(type_spec, dict):
        type_str = type_spec.get('type')
        if type_str == 'string':
            return str
        elif type_str == 'number':
            return float if '.' in str(type_spec.get('example', '')) else int
        elif type_str == 'boolean':
            return bool
        # Add more mappings as necessary
    # Fallback or default type
    return str  # or any other default type

class ComposioToolSpec:
    """Generic tool spec based on composio_tool.json schema."""

    def __init__(self, tool_schema: str) -> None:
        """Initialize with composio tool schema."""
        self.tool_schema = json.loads(tool_schema)
        self.spec_functions = self._generate_spec_functions()

    def _generate_spec_functions(self) -> List[str]:
        """Generate spec functions based on the tools actions."""
        spec_functions = []
        for tool in self.tool_schema.get("tools", []):
            for action in tool.get("Actions", []):
                function_name = tool["Name"] + "_" + action["Id"]
                spec_functions.append(function_name)
                input_params = action["Signature"]["Input"]["properties"]
                setattr(self, function_name, self._create_function(action["Id"], action["Description"], input_params, action["Signature"]["Input"].get("required", []))
        return spec_functions

    def _create_function(self, action_id: str, description: str, input_params: Dict[str, Any], required_params: List[str] = []):
        """Create a function for the given action with typed arguments."""

        # Function template that uses **kwargs to accept any arguments and performs an actual API call.
        def template_function(**kwargs) -> Dict[str, Any]:
            missing_params = [param for param in input_params if param not in kwargs and param in input_params['required']]
            if missing_params:
                return {"error": f"Missing required params: {missing_params}"}
            params = {param: kwargs[param] for param in input_params if param in kwargs}
            logger.info(f"Executing action {action_id} with {params}")
            
            # Placeholder for actual API call
            # This should be replaced with the actual call to the tool's API
            # For example:
            # response = requests.post(f"http://api.example.com/{action_id}", json=params)
            # return response.json()

            # Placeholder response
            return {"success": True, "action": action_id, "params": params}

        
        parameters = [
            {"name": param, "type": map_composio_type_to_python(input_params[param]), "description": input_params[param].get("description", ""), "default": None if param not in required_params else ...}
            for param in input_params
        ]

        # Assign the new signature to the function.
        template_function.__signature__ = str(parameters)  # Simplified for demonstration
        template_function.__doc__ = description

        return template_function
