import os
import yaml
import requests
from inspect import Parameter, Signature
from typing import List, Dict, Any
import types
import logging
import nest_asyncio

from llama_index.core.tools.tool_spec.base import BaseToolSpec

nest_asyncio.apply()

os.environ["OPENAI_API_KEY"] = "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"

logger = logging.getLogger(__name__)

def map_openapi_type_to_python(type_spec):
    if isinstance(type_spec, dict):
        type_str = type_spec.get('type')
        if type_str == 'string':
            return str
        # Add more mappings as necessary
    # Fallback or default type
    return str  # or any other default type

class APIToolSpec(BaseToolSpec):
    """Generic API tool spec based on OpenAPI schema."""

    def __init__(self, api_schema: str) -> None:
        """Initialize with OpenAPI schema."""
        self.api_schema = yaml.safe_load(api_schema)
        self.spec_functions = self._generate_spec_functions()

    def _generate_spec_functions(self) -> List[str]:
        """Generate spec functions based on the OpenAPI paths."""
        spec_functions = []
        for path, methods in self.api_schema.get("paths", {}).items():
            for method, details in methods.items():
                print("details:", details)
                function_name = self._generate_function_name(path, method)
                spec_functions.append(function_name)
                request_body_params = self._extract_request_body_params(details)
                setattr(self, function_name, self._create_function(path, method, details.get("summary", ""), request_body_params))
        return spec_functions

    @staticmethod
    def _generate_function_name(path: str, method: str) -> str:
        """Generate a function name based on the path and method."""
        clean_path = path.strip("/").replace("/", "_")
        return f"{method}_{clean_path}"

    @staticmethod
    def _extract_request_body_params(details: Dict[str, Any]) -> Dict[str, Any]:
        """Extract request body parameters from the OpenAPI details."""
        try:
            return details['requestBody']['content']['application/json']['schema']['properties']
        except KeyError:
            return {}

    def _create_function(self, path: str, method: str, description: str, request_body_params: Dict[str, Any]):
        """Create a function for the given path and method with typed arguments."""

        # Function template that uses **kwargs to accept any arguments and performs an actual API call.
        def template_function(**kwargs) -> Dict[str, Any]:
            missing_params = [param for param in request_body_params if param not in kwargs]
            if missing_params:
                return {"error": f"Missing required params: {missing_params}"}
            params = {param: kwargs[param] for param in request_body_params}
            logger.info(f"Executing {method.upper()} request to {path} with {params}")
            
            # Actual API call
            full_url = f"{self.api_schema['servers'][0]['url']}{path}"
            headers = {'Content-Type': 'application/json'}
            if method.lower() == 'post':
                response = requests.post(full_url, json=params, headers=headers)
            elif method.lower() == 'get':
                response = requests.get(full_url, params=params, headers=headers)
            else:
                return {"error": f"Method {method.upper()} not supported"}
            return response.json()

        # Create parameters with types for the new function's signature.
        parameters = [
            Parameter(name=param, kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=map_openapi_type_to_python(type_))
            for param, type_ in request_body_params.items()
        ]

        # Create a new signature from the parameters including the return annotation.
        new_sig = Signature(parameters, return_annotation=Dict[str, Any])

        # Use types.FunctionType to create a new function with the desired signature.
        func = types.FunctionType(template_function.__code__, globals(), "function", closure=template_function.__closure__)
        
        # Assign the new signature to the function.
        func.__signature__ = new_sig
        func.__doc__ = description

        return func
