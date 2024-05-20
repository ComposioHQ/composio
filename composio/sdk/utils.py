import subprocess
from typing import Any, Dict, Union
from pydantic import BaseModel
from enum import Enum
from composio.sdk.enums import Action

from composio.sdk.exceptions import NotFoundException

class SchemaFormat(Enum):
    OPENAI = "openai"
    DEFAULT = "default"
    CLAUDE = "claude"

class OpenAISchema(BaseModel):
    type: str
    function: Dict[str, Any]

class ClaudeSchema(BaseModel):
    name: str
    description: str
    input_schema: Dict[str, Any]

def format_schema(action_schema, format: SchemaFormat = SchemaFormat.OPENAI) -> Union[OpenAISchema, ClaudeSchema]:
    if format == SchemaFormat.OPENAI:   
        return OpenAISchema(
            type="function",
            function={
                "name": action_schema["name"],
                "description": action_schema.get("description", ""),
                "parameters": action_schema.get("parameters", {}),
            }
        )
    elif format == SchemaFormat.CLAUDE:
        return ClaudeSchema(
            name=action_schema["name"],
            description=action_schema.get("description", ""),
            input_schema=action_schema.get("parameters", {}),
        )
    else:
        formatted_schema = action_schema
        # print("Only OPENAI formatting is supported now.")
    
    return formatted_schema



class GitUserInfo(BaseModel):
    name: Union[None, str]
    email: Union[None, str]


def get_git_user_info() -> GitUserInfo:
    try:
        name = (
            subprocess.check_output(["git", "config", "user.name"])
            .strip()
            .decode("utf-8")
        )
        email = (
            subprocess.check_output(["git", "config", "user.email"])
            .strip()
            .decode("utf-8")
        )
        return GitUserInfo(name=name, email=email)
    except subprocess.CalledProcessError:
        return GitUserInfo(name=None, email=None)


def get_frontend_url(path: str) -> str:
    base_url = get_base_url()
    if base_url == "https://backend.composio.dev/api":
        return f"https://app.composio.dev/{path}"
    if base_url == "https://hermes-development.up.railway.app/api":
        return f"https://hermes-frontend-git-master-composio.vercel.app/{path}"
    if base_url == "http://localhost:9900/api":
        return f"http://localhost:3000/{path}"
    if base_url == "https://hermes-development.up.railway.app/":
        return f"https://hermes-frontend-git-master-composio.vercel.app/{path}"

    raise Exception(f"Incorrect format for base_url: {base_url}. Format should be https://backend.composio.dev/api or http://localhost:9900/api")

def build_query_params(**kwargs):
    """
    This function builds query parameters for a URL.
    It supports string and list values.
    """
    query_params = {}
    for key, value in kwargs.items():
        if value is not None:
            query_params[key] = (
                value if isinstance(value, str) else ",".join(value)
            )
    return query_params

def build_query_url(base_url: str, query_params: dict):
    """
    This function builds a query URL for a given base URL and query parameters.
    It returns the URL with the query parameters appended to the base URL.
    """
    query_string = "&".join(
        [f"{key}={value}" for key, value in query_params.items()]
    )
    return f"{base_url}?{query_string}" if query_string else base_url

def get_action_enum(self, action_name: str, tool_name: str) -> Action:
    for action in Action:
        if (
            action.action == action_name.lower()
            and action.service == tool_name.lower()
        ):
            return action
    raise NotFoundException(
        f"No matching action found for action: {action_name.lower()} and tool: {tool_name.lower()}"
    )

def get_action_enum_without_tool(self, action_name: str) -> Action:
    for action in Action:
        if action.action == action_name.lower():
            return action
    raise NotFoundException(f"No matching action found for action: {action_name.lower()}")