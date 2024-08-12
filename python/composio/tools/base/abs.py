"""Base abstractions."""

import hashlib
import inspect
import typing as t
from abc import abstractmethod
from pathlib import Path

import inflection
import jsonref
import pydantic
from pydantic import BaseModel, Field

from composio.client.enums import Action as ActionEnum
from composio.utils.logging import WithLogger


GroupID = t.Literal["runtime", "local"]
ModelType = t.TypeVar("ModelType")
ActionResponse = t.TypeVar("ActionResponse")
ActionRequest = t.TypeVar("ActionRequest")
Loadable = t.TypeVar("Loadable")
RegistryType = t.Dict[GroupID, t.Dict[str, "Tool"]]

registry: RegistryType = {"runtime": {}, "local": {}}


def remove_json_ref(data: t.Dict) -> t.Dict:
    full = t.cast(
        t.Dict,
        jsonref.replace_refs(
            obj=data,
            lazy_load=False,
        ),
    )
    return full


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
    name: str
    """Name represenation."""

    enum: str
    """Enum key."""

    display_name: str
    """Display compatible name."""

    description: str
    """Description string."""


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
        return remove_json_ref(request)

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
            raise ValueError(message) from e


class _Response(t.Generic[ModelType]):
    """Response util."""

    def __init__(self, model: t.Type[ModelType]) -> None:
        """Initialize request model."""
        self.model = model
        self.wrapper = self.wrap(model=model)

    @classmethod
    def wrap(cls, model: t.Type[ModelType]) -> t.Type[BaseModel]:
        class wrapper(model):  # type: ignore
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
        return remove_json_ref(schema)


class ActionMeta(type):
    """Action metaclass."""

    def __init__(  # pylint: disable=unused-argument, self-cls-assignment
        cls,
        name: str,
        bases: t.Tuple,
        dict_: t.Dict,
        abs: bool = False,
    ) -> None:
        """Initialize action class."""
        if abs or name == "Action":
            return

        cls = t.cast(t.Type["Action"], cls)
        try:
            (generic,) = getattr(cls, "__orig_bases__")
            request, response = t.get_args(generic)
            if request == ActionRequest or response == ActionResponse:
                raise ValueError(f"Invalid type generics, ({request}, {response})")
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

        setattr(cls, "file", getattr(cls, "file", Path(inspect.getfile(cls))))
        setattr(cls, "name", getattr(cls, "mame", inflection.underscore(cls.__name__)))
        setattr(
            cls,
            "enum",
            getattr(cls, "enum", inflection.underscore(cls.__name__).upper()),
        )
        setattr(
            cls,
            "display_name",
            getattr(cls, "display_name", inflection.humanize(cls.__name__)),
        )
        setattr(
            cls,
            "description",
            (cls.__doc__ or cls.display_name).lstrip().rstrip(),
        )


class Action(
    WithLogger,
    _Attributes,
    t.Generic[ActionRequest, ActionResponse],
    metaclass=ActionMeta,
):
    """Action abstraction."""

    _tags: t.Optional[t.List[str]] = None

    _schema: t.Optional[t.Dict] = None

    tool: str
    """Toolname."""

    request: _Request[ActionRequest]
    """Request helper."""

    response: _Response[ActionResponse]
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
    def _generate_schema(cls) -> None:
        """Generate action schema."""
        description = (
            cls.__doc__.lstrip().rstrip()
            if cls.__doc__
            else inflection.titleize(cls.display_name)
        )
        cls._schema = {
            "name": cls.name,
            "enum": cls.enum,
            "appKey": cls.tool,
            "appName": cls.tool,
            "appId": generate_app_id(cls.tool),
            "logo": "empty",
            "tags": cls.tags(),
            "enabled": True,
            "displayName": cls.display_name,
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
        request: ActionRequest,
        metadata: t.Dict,
    ) -> ActionResponse:
        """Execute the action."""


class Tool(WithLogger, _Attributes):
    """Tool abstraction."""

    gid: GroupID
    """Group ID for this tool."""

    file: Path
    """Path to module file."""

    name: str
    """Tool name."""

    _schema: t.Optional[t.Dict] = None
    """Schema for the app."""

    _actions: t.Dict[str, t.Type[Action]]
    """Actions container"""

    def __init_subclass__(cls, autoload: bool = False) -> None:
        """Initialize a tool class."""

    def __init__(self) -> None:
        """Initialize tool class."""
        super().__init__()
        self._path = Path(__file__).parent

    @classmethod
    def get(cls, enum: ActionEnum) -> t.Type[Action]:
        """Returns the"""
        return cls._actions[enum.slug]

    @classmethod
    @abstractmethod
    def actions(cls) -> t.List[t.Type[t.Any]]:
        """Get collection of actions for the tool."""

    @classmethod
    def _generate_schema(cls) -> None:
        """Generate schema for the app."""
        cls._schema = {
            "name": cls.name,
            "displayName": cls.display_name,
            "metaData": {
                "toolName": cls.name,
                "groupId": cls.gid,
                "displayName": cls.display_name,
                "description": cls.description,
                "toolPath": str(cls.file),
            },
            "integration": {},
            "description": cls.description,
            "actions": [action.schema() for action in cls.actions()],
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

    @classmethod
    def register(cls: t.Type["Tool"]) -> None:
        """Register given tool to the registry."""
        if cls.gid not in registry:
            registry[cls.gid] = {}
        registry[cls.gid][cls.enum] = cls()
        registry[cls.gid][cls.name] = registry[cls.gid][cls.enum]
