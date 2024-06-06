import hashlib
import json
import inflection
import jsonref
import os

from abc import ABC, abstractmethod
from typing import List
from pydantic import BaseModel


def generate_hashed_appId(input_string):
    # Generate a 32-character hash using MD5
    hash_object = hashlib.md5(input_string.encode())
    hash_string = hash_object.hexdigest()
    # Insert hyphens at the specified positions
    formatted_hash = f"{hash_string[:8]}-{hash_string[8:12]}-{hash_string[12:16]}-{hash_string[16:20]}-{hash_string[20:]}"

    return formatted_hash


class Action(ABC):
    _history_maintains: bool = False
    _display_name: str = ""  # Add an internal variable to hold the display name
    _request_schema: type[BaseModel]  # Placeholder for request schema
    _response_schema: type[BaseModel]  # Placeholder for response schema
    _tags: List[str] = []  # Placeholder for tags
    _tool_name: str = ""
    _potentially_long_response: bool = False  # Placeholder for potentially long response

    @property
    def tool_name(self) -> str:
        return self._tool_name

    @tool_name.setter
    def tool_name(self, value: str):
        self._tool_name = value

    @property
    def action_name(self) -> str:
        return self.__class__.__name__.lower()

    @property
    def display_name(self) -> str:
        return self._display_name

    @display_name.setter
    def display_name(self, value: str):
        self._display_name = value  # Set the internal variable

    @property
    def tags(self) -> List[str]:
        return self._tags

    @tags.setter
    def tags(self, value: List[str]):
        self._tags = value  # Set the internal variable

    @property
    def request_schema(self) -> type[BaseModel]:
        return self._request_schema

    @request_schema.setter
    def request_schema(self, value: type[BaseModel]):
        self._request_schema = value

    @property
    def response_schema(self) -> type[BaseModel]:
        return self._response_schema

    @response_schema.setter
    def response_schema(self, value: type[BaseModel]):
        self._response_schema = value
    
    @property
    def potentially_long_response(self) -> bool:
        return self._potentially_long_response
    
    @potentially_long_response.setter
    def potentially_long_response(self, value: bool):
        self._potentially_long_response = value

    @abstractmethod
    def execute(self, request_data: type[BaseModel], authorisation_data: dict) -> dict:
        pass

    @property
    def required_scopes(self) -> List[str]:
        return []

    def get_tool_merged_action_name(self) -> str:
        return f"{self._tool_name}_{inflection.underscore(self.action_name)}"

    def get_action_schema(self):
        
        request_schema_json = self.request_schema.model_json_schema(by_alias=False)
        modified_parameters = request_schema_json.get('properties', {})
        
        for param, details in modified_parameters.items():
            if details.get('json_schema_extra', {}).get('file_readable', False):
                details['oneOf'] = [
                    {'type': details.get('type'), 'description': details.get('description', '')},
                    {'type': 'string', 'format': 'file-path', 'description': f"File path to {details.get('description', '')}"}
                ]
                del details['type']  # Remove original type to avoid conflict in oneOf

        action_schema = {
            "appKey": self._tool_name,
            "appName": self._tool_name,
            "logo": "empty",
            "appId": generate_hashed_appId(self._tool_name),
            "name": self.get_tool_merged_action_name(),
            "display_name": self.display_name,  # type: ignore
            "tags": self.tags,  # type: ignore
            "enabled": True,
            "description": self.__class__.__doc__ if self.__class__.__doc__ else self.action_name,  # type: ignore
            "parameters": jsonref.loads(json.dumps(modified_parameters)),
            "response": jsonref.loads(
                json.dumps(self.response_schema.model_json_schema())
            ),
        }
        return action_schema

    def execute_action(self, request_data: dict, metadata: dict):
        # req = self._request_schema.model_validate_json(json_data=json.dumps(request_data))

        # print(f"Executing {self.__class__.__name__} on Tool: {self.tool_name} with request data {request_data} and meta data {metadata}")
        try:
            request_schema = self.request_schema  # type: ignore
            modified_request_data = {}

            for param, value in request_data.items():
                annotations = request_schema.model_fields[param].json_schema_extra
                file_readable = annotations is not None and annotations.get('file_readable', False)
                if file_readable and isinstance(value, str) and os.path.isfile(value):
                    with open(value, 'r') as file:
                        modified_request_data[param] = file.read()
                else:
                    modified_request_data[param] = value

            req = request_schema.model_validate_json(json_data=json.dumps(modified_request_data))
            return self.execute(req, metadata)  # type: ignore
        except json.JSONDecodeError as e:
            # logger.error(f"Error executing {action.__name__} on Tool: {tool_name}: {e}\n{traceback.format_exc()}")
            return {
                "status": "failure",
                "details": f"Could not parse response with error: {e}. Please contact the tool developer.",
            }
            # logger.error(f"Error executing {action.__name__} on Tool: {tool_name}: {e}\n{traceback.format_exc()}")
        except Exception as e:
            return {
                "status": "failure",
                "details": "Error executing action with error: " + str(e),
            }
