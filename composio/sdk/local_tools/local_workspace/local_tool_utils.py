import os
import types
from inspect import Signature

from inspect import Parameter
from typing import Type, Dict, Any, List, Optional

from pydantic.v1 import BaseModel, Field, create_model

from langchain_core.tools import StructuredTool
from fastapi.encoders import jsonable_encoder

from tools.services.swelib.local_workspace.workspace_manager_factory import (WorkspaceManagerFactory,
                                                                             KEY_WORKSPACE_MANAGER,
                                                                             KEY_CONTAINER_NAME,
                                                                             KEY_PARENT_PIDS,
                                                                             KEY_IMAGE_NAME)
from tools.services.swelib.local_workspace.local_docker_workspace import LocalDockerWorkspace
from tools.services.swelib.local_workspace.copy_github_repo import CopyGithubRepoRequest, execute_copy_github_repo

try:
    import rich
except ModuleNotFoundError as e:
    raise RuntimeError(
        "You probably either forgot to install the dependencies "
        "or forgot to activate your conda or virtual environment."
    ) from e

try:
    from rich_argparse import RichHelpFormatter
except ImportError:
    msg = (
        "Please install the rich_argparse package with `pip install rich_argparse`."
    )
    raise ImportError(msg)

from observation_assembler import ObservationAssemblerArgumentsModel, execute_observation_handler
from local_workspace import LocalDockerArgumentsModel
from docker_cmd_manager import DockerCommandManagerArgsModel, execute_docker_cmd_manager
from workspace_status import DockerContainerStatusRequest, execute_docker_status
from docker_setup_env import DockerSetupEnvRequest, execute_docker_setup_env
from parsing import ParseCommandBash
from utils import *


schema_type_python_type_dict = {
    "string": str,
    "number": float,
    "boolean": bool,
    "integer": int,
}

fallback_values = {
    "string": "",
    "number": 0.0,
    "integer": 0,
    "boolean": False,
    "object": {},
    "array": [],
}

workspace_factory = WorkspaceManagerFactory()

HARD_CODED_REPO_NAME = os.environ.get("HARD_CODED_REPO_NAME", "princeton-nlp/SWE-bench")
KEY_WORKSPACE_ID = "workspace_id"


def json_schema_to_model(json_schema: Dict[str, Any]) -> Type[BaseModel]:
    """
    Converts a JSON schema to a Pydantic BaseModel class.

    Args:
        json_schema: The JSON schema to convert.

    Returns:
        A Pydantic BaseModel class.
    """

    # Extract the model name from the schema title.
    model_name = json_schema.get("title")

    # Extract the field definitions from the schema properties.
    field_definitions = {
        name: json_schema_to_pydantic_field(name, prop, json_schema.get("required", []))
        for name, prop in json_schema.get("properties", {}).items()
    }

    # Create the BaseModel class using create_model().
    return create_model(model_name, **field_definitions)


def json_schema_to_pydantic_field(
    name: str, json_schema: Dict[str, Any], required: List[str]
) -> Any:
    """
    Converts a JSON schema property to a Pydantic field definition.

    Args:
        name: The field name.
        json_schema: The JSON schema property.

    Returns:
        A Pydantic field definition.
    """

    # Get the field type.
    type_ = json_schema_to_pydantic_type(json_schema)

    # Get the field description.
    description = json_schema.get("description")

    # Get the field examples.
    examples = json_schema.get("examples", [])

    # Create a Field object with the type, description, and examples.
    # The 'required' flag will be set later when creating the model.
    return (
        type_,
        Field(
            description=description,
            examples=examples,
            default=... if name in required else None,
        ),
    )


def json_schema_to_pydantic_type(  # pylint: disable=too-many-return-statements
    json_schema: Dict[str, Any]
) -> Any:
    """
    Converts a JSON schema type to a Pydantic type.

    Args:
        json_schema: The JSON schema to convert.

    Returns:
        A Pydantic type.
    """

    type_ = json_schema.get("type")

    if type_ == "string":
        return str

    if type_ == "integer":
        return int

    if type_ == "number":
        return float

    if type_ == "boolean":
        return bool

    if type_ == "array":
        items_schema = json_schema.get("items")
        if items_schema:
            item_type = json_schema_to_pydantic_type(items_schema)
            return List[item_type]
        return List

    if type_ == "object":
        # Handle nested models.
        properties = json_schema.get("properties")
        if properties:
            nested_model = json_schema_to_model(json_schema)
            return nested_model
        return Dict

    if type_ == "null":
        return Optional[Any]  # Use Optional[Any] for nullable fields

    raise ValueError(f"Unsupported JSON schema type: {type_}")


def pydantic_model_from_param_schema(param_schema):
    """
    Dynamically creates a Pydantic model from a schema dictionary.

    Args:
    param_schema (dict): Schema with 'title', 'properties', and optionally 'required' keys.

    Returns:
    BaseModel: A Pydantic model class for the defined schema.

    Raises:
    KeyError: Missing 'type' in property definitions.
    ValueError: Invalid 'type' for property or recursive model creation.

    Note:
    Requires global `schema_type_python_type_dict` for type mapping and `fallback_values` for default values.
    """
    required_fields = {}
    optional_fields = {}
    param_title = param_schema["title"].replace(" ", "")
    required_props = param_schema.get("required", [])

    if param_schema.get("type") == "array":
        print("param_schema inside array - ", param_schema)
        item_schema = param_schema.get("items")
        if item_schema:
            item_type = json_schema_to_pydantic_type(item_schema)
            return List[item_type]
        return List

    # schema_params_object = param_schema.get('properties', {})
    for prop_name, prop_info in param_schema.get("properties", {}).items():
        prop_type = prop_info["type"]
        prop_title = prop_info["title"].replace(" ", "")
        prop_default = prop_info.get("default", fallback_values[prop_type])
        if prop_type in schema_type_python_type_dict:
            signature_prop_type = schema_type_python_type_dict[prop_type]
        else:
            signature_prop_type = pydantic_model_from_param_schema(prop_info)

        if prop_name in required_props:
            required_fields[prop_name] = (
                signature_prop_type,
                Field(
                    ...,
                    title=prop_title,
                    description=prop_info.get(
                        "description", prop_info.get("desc", prop_title)
                    ),
                ),
            )
        else:
            optional_fields[prop_name] = (
                signature_prop_type,
                Field(title=prop_title, default=prop_default),
            )
    if not required_fields and not optional_fields:
        return Dict
    fieldModel = create_model(param_title, **required_fields, **optional_fields)
    return fieldModel


def get_signature_format_from_schema_params(schema_params):
    required_parameters = []
    optional_parameters = []

    required_params = schema_params.get("required", [])
    schema_params_object = schema_params.get("properties", {})
    for param_name, param_schema in schema_params_object.items():
        param_type = param_schema["type"]
        param_title = param_schema["title"].replace(" ", "")  # noqa: F841

        if param_type in schema_type_python_type_dict:
            signature_param_type = schema_type_python_type_dict[param_type]
        else:
            signature_param_type = pydantic_model_from_param_schema(param_schema)

        param_default = param_schema.get("default", fallback_values[param_type])
        param_annotation = signature_param_type
        param = Parameter(
            name=param_name,
            kind=Parameter.POSITIONAL_OR_KEYWORD,
            annotation=param_annotation,
            default=Parameter.empty if param_name in required_params else param_default,
        )
        is_required = param_name in required_params
        if is_required:
            required_parameters.append(param)
        else:
            optional_parameters.append(param)
    return required_parameters + optional_parameters


def wait():
    time.sleep(0.1)
    return


class WorkspaceFactoryRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id to get the running workspace-manager")


class CmdManager(BaseModel):
    workspace_id: str = Field(..., description="workspace-id to get the running workspace-manager")
    input_cmd: str


def get_container_process(workspace: LocalDockerWorkspace):
    return workspace.container


def execute_action(action_name: str, params: dict[str, Any]):
    if action_name == "workspace":
        args: LocalDockerArgumentsModel = LocalDockerArgumentsModel(image_name=params[KEY_IMAGE_NAME])
        workspace_id = workspace_factory.get_workspace_manager(args)
        return {KEY_WORKSPACE_ID: workspace_id}
    if action_name == "setupWorkspace":
        workspace_id = params[KEY_WORKSPACE_ID]
        workspace_meta = workspace_factory.get_registered_manager(workspace_id)
        args: DockerSetupEnvRequest = DockerSetupEnvRequest(
            container_name=workspace_meta[KEY_CONTAINER_NAME],
            workspace_id=workspace_id,
            image_name=workspace_meta[KEY_IMAGE_NAME])
        container_process = get_container_process(workspace_meta[KEY_WORKSPACE_MANAGER])
        parent_pids = workspace_meta[KEY_PARENT_PIDS]
        return execute_docker_setup_env(args, container_process, parent_pids)
    if action_name == "commandManager":
        workspace_id = params[KEY_WORKSPACE_ID]
        workspace_meta = workspace_factory.get_registered_manager(workspace_id)
        args: DockerCommandManagerArgsModel = DockerCommandManagerArgsModel(container_name=workspace_meta[KEY_CONTAINER_NAME],
                                                                            input_cmd=params["input_cmd"],
                                                                            workspace_id=workspace_id,
                                                                            image_name=workspace_meta[KEY_IMAGE_NAME])
        container_process = get_container_process(workspace_meta[KEY_WORKSPACE_MANAGER])
        parent_pids = workspace_meta[KEY_PARENT_PIDS]
        return execute_docker_cmd_manager(args, container_process, parent_pids)
    if action_name == "cloneGithubRepo":
        workspace_id = params[KEY_WORKSPACE_ID]
        workspace_meta = workspace_factory.get_registered_manager(workspace_id=workspace_id)
        args: CopyGithubRepoRequest = CopyGithubRepoRequest(
            container_name=workspace_meta[KEY_CONTAINER_NAME],
            repo_name=HARD_CODED_REPO_NAME,
            workspace_id=workspace_id,
            image_name=workspace_meta[KEY_IMAGE_NAME]
        )
        container_process = get_container_process(workspace_meta[KEY_WORKSPACE_MANAGER])
        return execute_copy_github_repo(args, container_process, workspace_meta[KEY_PARENT_PIDS])
    if action_name == "dockerContainerStatus":
        c_args = WorkspaceFactoryRequest(workspace_id=params[KEY_WORKSPACE_ID])
        workspace_meta = workspace_factory.get_registered_manager(c_args.workspace_id)
        args: DockerContainerStatusRequest = DockerContainerStatusRequest(
            container_name=workspace_meta[KEY_CONTAINER_NAME])
        return execute_docker_status(args)
    if action_name == "observationHandler":
        args: ObservationAssemblerArgumentsModel = ObservationAssemblerArgumentsModel(container_name=params["observation_args"])
        return execute_observation_handler(args)
    if action_name == "waitFor10Second":
        return wait
    return Exception(f"action {action_name} not supported")


def ComposioTool(action_schema: dict[str, any]) -> StructuredTool:
    name = action_schema["name"]
    description = action_schema["description"]
    parameters = json_schema_to_model(action_schema.get("parameters")) if action_schema.get("parameters") else None
    func_params = get_signature_format_from_schema_params(action_schema.get("parameters")) if action_schema.get("parameters") else None
    action_signature = Signature(parameters=func_params)
    placeholder_function = lambda **kwargs: execute_action(name, kwargs)
    action_func = types.FunctionType(
        placeholder_function.__code__,
        globals=globals(),
        name=name,
        closure=placeholder_function.__closure__,
    )
    action_func.__signature__ = action_signature
    action_func.__doc__ = description
    return StructuredTool.from_function(
        name=name,
        description=description,
        args_schema=parameters,
        return_schema=True,
        # TODO use execute action here
        func=action_func,
    )


def sort_params_on_default(param_schema):
    # Function to determine the sort key
    def sort_key(item):
        key, value = item
        # Priority 1: No 'default' key
        if 'default' not in value:
            return 0
        # Priority 2: 'default' is None
        elif value['default'] is None:
            return 1
        # Priority 3: 'default' has some value
        else:
            return 2

    # Sorting the dictionary based on our custom sort key
    param_schema["properties"] = dict(sorted(param_schema["properties"].items(), key=sort_key))
    return param_schema


def json_schema_enum_processor(param_schema):
    for prop_name, prop_details in param_schema["properties"].items():
        if 'allOf' in prop_details:
            if len(prop_details['allOf']) == 1:
                enum_schema = param_schema["properties"][prop_name].pop("allOf")[0]
                param_schema["properties"][prop_name].update(enum_schema)
            else:
                raise ValueError("Case of No/Multiple allOf elements in parameters schema not yet handeled.")

        if 'const' in param_schema["properties"][prop_name]:
            if "type" not in param_schema["properties"][prop_name]:
                type_map = {
                    str: "string",
                    int: "integer",
                    float: "number",
                    bool: "boolean"
                }
                param_schema["properties"][prop_name]['type'] = type_map[
                    type(param_schema["properties"][prop_name]['const'])]
            param_schema["properties"][prop_name]["enum"] = [param_schema["properties"][prop_name].pop("const")]

    if "$defs" in param_schema:
        param_schema.pop("$defs")
    return param_schema


# initialize langchain tools --> so composio tools can run on local
def ComposioToolset() -> List[StructuredTool]:
    action_list = [{
        "name": "workspace",
        "display_name": "workspace initializer",
        "description": ("creates a local docker container and sets it up for running various commands."
                        "It returns the docker-container name so other tools can use the container_name"
                        "to connect with the workspace. This action takes time to start the workspace. "
                        "Wait for 10 seconds before trying to run this again"),
        "parameters": sort_params_on_default(json_schema_enum_processor(
            jsonable_encoder(LocalDockerArgumentsModel.schema(by_alias=False)))),

    }, {
        "name": "commandManager",
        "description": ("Connects to an already initialized workspace, and runs a shell command on that workspace."
                        "It takes the workspace-id to run the shell-command in given workspace"),
        "parameters": sort_params_on_default(json_schema_enum_processor(
            jsonable_encoder(CmdManager.schema(by_alias=False)))),

    }, {
        "name": "observationHandler",
        "description": ("handles history and observation for input to be given to agent. "
                        "Call this tool to wrap the output of previous command and then consume the wrapped output"
                        "for next turn"),
        "parameters": sort_params_on_default(json_schema_enum_processor(
            jsonable_encoder(ObservationAssemblerArgumentsModel.schema(by_alias=False)))),
    }, {
        "name": "waitFor10Second",
        "description": "It waits for 10 seconds before returning the response. It executes a time.sleep(10) on being called",
    }, {
        "name": "dockerContainerStatus",
        "description": "returns the status of container-name given in the request",
        "parameters": sort_params_on_default(json_schema_enum_processor(
            jsonable_encoder(WorkspaceFactoryRequest.schema(by_alias=False)))),
    }, {
        "name": "setupWorkspace",
        "description": "sets up workspace with all the required environment variables. "
                       "It also copies the special commands given by user in the workspace. "
                       "Use this function after initializing the workspace.",
        "parameters": sort_params_on_default(json_schema_enum_processor(
            jsonable_encoder(WorkspaceFactoryRequest.schema(by_alias=False)))),
    }, {
        "name": "cloneGithubRepo",
        "description": "clones the hardcoded github repo to workspace path. "
                       "It uses the github_token from os environment",
        "parameters": sort_params_on_default(json_schema_enum_processor(
            jsonable_encoder(WorkspaceFactoryRequest.schema(by_alias=False)))),
    }]
    return [
        ComposioTool(action) for action in action_list
    ]


def get_command_docs(command_files):
    parse_command = ParseCommandBash()
    command_docs = []
    for file in command_files:
        commands = parse_command.parse_command_file(path=file)
        commands = [
            command for command in commands if not command.name.startswith("_")
        ]
        command_docs.append(parse_command.generate_command_docs(commands, []))
    return "\n".join(command_docs)




# my_tool_set = ComposioToolset()


