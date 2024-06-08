import hashlib
import json
from abc import ABC, abstractmethod
from typing import List

import inflection
import jsonref
from pydantic import BaseModel
from typing import Union, Any
from typing import TypeVar, Generic, Type

def generate_hashed_appId(input_string):
    # Generate a 32-character hash using MD5
    hash_object = hashlib.md5(input_string.encode())
    hash_string = hash_object.hexdigest()
    # Insert hyphens at the specified positions
    formatted_hash = f"{hash_string[:8]}-{hash_string[8:12]}-{hash_string[12:16]}-{hash_string[16:20]}-{hash_string[20:]}"

    return formatted_hash



RequestType = TypeVar('RequestType', bound=BaseModel)
ResponseType = TypeVar('ResponseType', bound=BaseModel)

class Action(ABC, Generic[RequestType, ResponseType]):
    _history_maintains: bool = False
    _display_name: str = ""  # Add an internal variable to hold the display name
    _request_schema: Type[RequestType]  # Placeholder for request schema
    _response_schema: Type[ResponseType]  # Placeholder for response schema
    _tags: List[str] = []  # Placeholder for tags
    _tool_name: str = ""

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
    def request_schema(self) -> Type[RequestType]:
        return self._request_schema

    @request_schema.setter
    def request_schema(self, value: Type[RequestType]):
        self._request_schema = value

    @property
    def response_schema(self) -> Type[ResponseType]:
        return self._response_schema

    @response_schema.setter
    def response_schema(self, value: Type[ResponseType]):
        self._response_schema = value

    @abstractmethod
    def execute(self, request_data: RequestType, authorisation_data: dict) -> Union[dict, ResponseType]: 
        pass

    @property
    def required_scopes(self) -> List[str]:
        return []

    def get_tool_merged_action_name(self) -> str:
        return f"{self._tool_name}_{inflection.underscore(self.action_name)}"

    def get_action_schema(self):
        action_schema = {
            "appKey": self._tool_name,
            "appName": self._tool_name,
            "logo": "empty",
            "appId": generate_hashed_appId(self._tool_name),
            "name": self.get_tool_merged_action_name(),
            "display_name": self.display_name,
            "tags": self.tags,
            "enabled": True,
            "description": self.__class__.__doc__ if self.__class__.__doc__ else self.action_name,
            "parameters": jsonref.loads(
                json.dumps(self.request_schema.model_json_schema(by_alias=False))
            ),
            "response": jsonref.loads(
                json.dumps(self.response_schema.model_json_schema())
            ),
        }

        return action_schema

    def execute_action(self, request_data: RequestType, metadata: dict) -> Union[dict, ResponseType]:
        # req = self._request_schema.model_validate_json(json_data=json.dumps(request_data))

        # print(f"Executing {self.__class__.__name__} on Tool: {self.tool_name} with request data {request_data} and meta data {metadata}")
        try:
            request_schema = self.request_schema  # type: ignore
            req = request_schema.model_validate_json(json_data=json.dumps(request_data))
            return self.execute(req, metadata)  # type: ignore
        except json.JSONDecodeError as e:
            # logger.error(f"Error executing {action.__name__} on Tool: {tool_name}: {e}\n{traceback.format_exc()}")
            return {
                "status": "failure",
                "details": f"Could not parse response with error: {e}. Please contact the tool developer.",
            }
        except Exception as e:
            # logger.error(f"Error executing {action.__name__} on Tool: {tool_name}: {e}\n{traceback.format_exc()}")
            return {
                "status": "failure",
                "details": "Error executing action with error: " + str(e),
            }


