"""Base abstractions."""

import hashlib
import inspect
import typing as t
from abc import abstractmethod
from pathlib import Path

import inflection
import pydantic
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from composio.client.enums import Action as ActionEnum
from composio.client.enums import Trigger as TriggerEnum
from composio.utils.logging import WithLogger
from composio.utils.logging import get as get_logger


GroupID = t.Literal["runtime", "local"]
ModelType = t.TypeVar("ModelType")
ExecuteActionResponse = t.TypeVar("ExecuteActionResponse")
ExecuteActionRequest = t.TypeVar("ExecuteActionRequest")
Loadable = t.TypeVar("Loadable", "Trigger", "Action")
RegistryType = t.Dict[GroupID, t.Dict[str, "Tool"]]

registry: RegistryType = {"runtime": {}, "local": {}}
logger = get_logger()


def generate_app_id(name: str) -> str:
    # Generate a 32-character hash using MD5
    hash_string = hashlib.md5(name.encode()).hexdigest()
    # Insert hyphens at the specified positions
    return "-".join(
        (
            hash_string[:8],
            hash_string[8:12],
            hash_string[12:16],
            hash_string[16:20],
            hash_string[20:],
        )
    )


class ExecuteResponse(BaseModel):
    """Execute action response."""


class _Attributes:
    @classmethod
    def display_name(cls) -> str:
        """Display name."""
        return inflection.underscore(word=cls.__name__)


class _Request(t.Generic[ModelType]):
    """Request util."""

    def __init__(self, model: t.Type[ModelType]) -> None:
        """Initialize request model."""
        self.model = model

    def schema(self) -> t.Dict:
        """Build request schema."""
        request = t.cast(t.Type[BaseModel], self.model).model_json_schema(by_alias=True)
        properties = request.get("properties", {})
        for details in properties.values():
            if details.get("file_readable", False):
                details["oneOf"] = [
                    {
                        "type": details.get("type"),
                        "description": details.get("description", ""),
                    },
                    {
                        "type": "string",
                        "format": "file-path",
                        "description": f"File path to {details.get('description', '')}",
                    },
                ]
                del details["type"]  # Remove original type to avoid conflict in oneOf
        request["properties"] = properties
        return jsonable_encoder(obj=request)

    def parse(self, request: t.Dict) -> ModelType:
        """Parse request."""
        try:
            return self.model(**request)
        except pydantic.ValidationError as e:
            message = "Invalid request data provided"
            missing = []
            others = [""]
            for error in e.errors():
                param = ".".join(map(str, error["loc"]))
                if error["type"] == "missing":
                    missing.append(param)
                    continue
                others.append(error["msg"] + f" on parameter `{param}`")
            if len(missing) > 0:
                message += f"\n- Following fields are missing: {set(missing)}"
            message += "\n- ".join(others)
            raise ValueError(message)


class _Response(t.Generic[ModelType]):
    """Response util."""

    def __init__(self, model: t.Type[ModelType]) -> None:
        """Initialize request model."""
        self.model = model
        self.wrapper = self.wrap(model=model)

    @classmethod
    def wrap(cls, model: t.Type[ModelType]) -> t.Type[BaseModel]:
        class wrapper(model):
            successful: bool = Field(
                ...,
                description="Whether or not the action execution was successful or not",
            )
            error: t.Optional[str] = Field(
                None,
                description="Error if any occured during the execution of the action",
            )

        return t.cast(t.Type[BaseModel], wrapper)

    def schema(self) -> t.Dict:
        """Build request schema."""
        schema = self.wrapper.model_json_schema(by_alias=True)
        schema["title"] = self.model.__name__
        return jsonable_encoder(obj=schema)


class ActionMeta(type):
    """Action metaclass."""

    def __init__(
        cls,
        name: str,
        bases: t.Tuple,
        dict_: t.Dict,
        abs: bool = False,
    ) -> None:
        """Initialize action class."""
        if abs or name == "Action":
            return

        try:
            (generic,) = getattr(cls, "__orig_bases__")
            request, response = t.get_args(generic)
        except ValueError as e:
            raise ValueError(
                "Invalid action class definition, please define your class "
                "using request and response type generics; "
                f"class {name}(Action[RequestModel, ResponseModel])"
            ) from e

        setattr(cls, "request", _Request(request))
        setattr(cls, "response", _Response(response))
        if getattr(getattr(cls, "execute"), "__isabstractmethod__", False):
            raise RuntimeError(f"Please implement {name}.execute")
        cls.file = getattr(cls, "file", Path(inspect.getfile(cls)))


class Action(
    WithLogger,
    _Attributes,
    t.Generic[ExecuteActionRequest, ExecuteActionResponse],
    metaclass=ActionMeta,
):
    """Action abstraction."""

    _tags: t.Optional[t.List[str]] = None

    _schema: t.Optional[t.Dict] = None

    tool: str
    """Toolname."""

    request: _Request[ExecuteActionRequest]
    """Request helper."""

    response: _Response[ExecuteActionResponse]
    """Response helper."""

    file: str
    """Path to the file containing the action"""

    requires: t.Optional[t.List[str]] = None
    """List of dependencies required to run this action."""

    def __init_subclass__(cls, abs: bool = False) -> None:
        """Initialize subclas."""

    @classmethod
    def tags(cls) -> t.List[str]:
        """Tags for the given action."""
        return cls._tags or []

    @classmethod
    def enum(cls) -> str:
        """Tool merged name for action"""
        return (cls.tool + "_" + cls.display_name()).upper()

    @classmethod
    def _generate_schema(cls) -> None:
        """Generate action schema."""
        description = (
            cls.__doc__.lstrip().rstrip()
            if cls.__doc__
            else inflection.titleize(cls.display_name())
        )
        cls._schema = {
            "appKey": cls.tool,
            "appName": cls.tool,
            "appId": generate_app_id(cls.tool),
            "logo": "empty",
            "name": cls.enum(),
            "tags": cls.tags(),
            "enabled": True,
            "display_name": cls.display_name(),
            "description": description,
            "parameters": cls.request.schema(),
            "response": cls.response.schema(),
        }

    @classmethod
    def schema(cls) -> t.Dict:
        """Action schema."""
        if cls._schema is None:
            cls._generate_schema()
        return cls._schema  # type: ignore

    @abstractmethod
    def execute(
        self,
        request: ExecuteActionRequest,
        metadata: t.Dict,
    ) -> ExecuteActionResponse:
        """Execute the action."""


class Trigger(WithLogger, _Attributes):
    """Trigger abstraction."""

    tool: str
    """Toolname."""

    def __init__(self) -> None:
        """Initialize trigger class."""
        super().__init__()

    @classmethod
    def schema(cls) -> t.Dict:
        """Trigger schema."""
        return {}
        # return {
        #     "name": add_tool_name(tool_name, trigger.__name__),
        #     "display_name": trigger().display_name,
        #     "description": trigger.__doc__.strip() if trigge
        #     "payload": jsonable_encoder(trigger().payload_schema.model_json_schema()),
        #     "config": jsonable_encoder(trigger().trigger_config_schema.model_json_schema()),
        #     "instructions": trigger().trigger_instructions,
        # }


class Tool(WithLogger, _Attributes):
    """Tool abstraction."""

    gid: GroupID
    """Group ID for this tool."""

    file: Path
    """Path to module file."""

    name: str
    """Tool name."""

    description: str
    """Tool description."""

    _schema: t.Optional[t.Dict] = None
    """Schema for the app."""

    _actions: t.Dict[str, t.Type[Action]]
    """Actions container"""

    _triggers: t.Dict[str, t.Type[Trigger]]
    """Triggers container"""

    def __init_subclass__(cls, autoload: bool = False) -> None:
        """Initialize a tool class."""

    def __init__(self) -> None:
        """Initialize tool class."""
        super().__init__()
        self._path = Path(__file__).parent

    @t.overload
    @classmethod
    def get(cls, enum: ActionEnum) -> t.Type[Action]:
        """Returns the"""

    @t.overload
    @classmethod
    def get(cls, enum: TriggerEnum) -> t.Type[Trigger]:
        """Returns the"""

    @classmethod
    def get(
        cls,
        enum: t.Union[ActionEnum, TriggerEnum],
    ) -> t.Union[t.Type[Action], t.Type[Trigger]]:
        """Returns the"""
        if type == "trigger":
            return cls._triggers[enum.name]
        return cls._actions[enum.name]

    @classmethod
    @abstractmethod
    def actions(cls) -> t.List[t.Type[Action]]:  # type: ignore
        """Get collection of actions for the tool."""
        return []

    @classmethod
    @abstractmethod
    def triggers(cls) -> t.List[t.Type[Trigger]]:
        """Get collection of triggers for the tool."""
        return []

    @classmethod
    def _generate_schema(cls) -> None:
        """Generate schema for the app."""
        cls._schema = {
            "Name": cls.name,
            "DisplayName": cls.display_name(),
            "Metadata": {
                "tool_name": cls.name,
                "group_id": cls.gid,
                "display_name": cls.display_name(),
                "description": cls.description,
                "tool_path": str(cls.file),
            },
            "Integration": {},
            "Description": cls.description,
            "Actions": [action.schema() for action in cls.actions()],
            "Triggers": [trigger.schema() for trigger in cls.triggers()],
        }

    @classmethod
    def schema(cls) -> t.Dict:
        """Get tool schema."""
        if cls._schema is None:
            cls._generate_schema()
        return cls._schema  # type: ignore

    def _load(self, loadable: t.Type[Loadable]) -> Loadable:
        """Load action class."""
        instance = loadable()
        instance.tool = self.name
        return instance

    def execute(
        self,
        action: str,
        params: t.Dict,
        metadata: t.Optional[t.Dict] = None,
    ) -> t.Dict:
        """
        Execute the given action

        :param action: Name of the action.
        :param params: Execution parameters.
        :param metadata: A dictionary containing metadata for action.
        """
        raise NotImplementedError()

    def poll(
        self,
        trigger: str,
        params: t.Dict,
        metadata: t.Optional[t.Dict] = None,
    ) -> t.Dict:
        """
        Poll the given trigger for event.

        :param trigger: Name of the trigger.
        :param params: Execution parameters.
        :param metadata: A dictionary containing metadata for action.
        """
        raise NotImplementedError()

    @classmethod
    def register(cls: t.Type["Tool"]) -> None:
        """Register given tool to the registry."""
        if cls.gid not in registry:
            registry[cls.gid] = {}
        registry[cls.gid][cls.display_name()] = cls()
