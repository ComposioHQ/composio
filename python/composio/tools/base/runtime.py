"""Tool abstractions."""

import inspect
import typing as t
from abc import abstractmethod

import inflection
import typing_extensions as te
from pydantic import BaseModel, Field

from composio import Composio
from composio.client.collections import ConnectedAccountModel, CustomAuthParameter
from composio.client.enums.base import ActionData, SentinalObject, add_runtime_action
from composio.client.exceptions import ComposioClientError
from composio.exceptions import ComposioSDKError
from composio.tools.base.abs import (
    Action,
    ActionRequest,
    ActionResponse,
    ToolBuilder,
    tool_registry,
)
from composio.tools.base.local import LocalToolMixin
from composio.tools.env.host.shell import Shell
from composio.tools.env.host.workspace import Browsers, FileManagers, Shells
from composio.utils import logging


if t.TYPE_CHECKING:
    from composio.tools.toolset import ComposioToolSet


class InvalidRuntimeAction(ComposioSDKError):
    """Raise when invalid action definition is found"""


class FileModel(BaseModel):
    name: str = Field(
        ...,
        description="File name, contains extension to indetify the file type",
    )
    content: bytes = Field(
        ...,
        description="File content in base64",
    )


class ArgSpec(BaseModel):
    """Argument specification."""

    description: str
    """Description of the argument variable."""

    default: t.Any = None
    """Default value"""


class RuntimeAction(  # pylint: disable=abstract-method
    SentinalObject,
    Action[ActionRequest, ActionResponse],
    abs=True,
):
    """Local action abstraction."""

    _shells: t.Callable[[], Shells]
    _browsers: t.Callable[[], Browsers]
    _filemanagers: t.Callable[[], FileManagers]

    @property
    def shells(self) -> Shells:
        return self._shells()

    @property
    def browsers(self) -> Browsers:
        return self._browsers()

    @property
    def filemanagers(self) -> FileManagers:
        return self._filemanagers()


class RuntimeToolMeta(type):
    """Tool metaclass."""

    def __init__(  # pylint: disable=self-cls-assignment,unused-argument
        cls,
        name: str,
        bases: t.Tuple,
        dict_: t.Dict,
        autoload: bool = False,
    ) -> None:
        """Initialize action class."""
        if name == "RuntimeTool":
            return

        cls = t.cast(t.Type[RuntimeTool], cls)
        ToolBuilder.validate(obj=cls, name=name, methods=("actions",))
        ToolBuilder.set_metadata(obj=cls)
        ToolBuilder.setup_children(obj=cls)

        if autoload:
            cls.register()


class RuntimeTool(LocalToolMixin, metaclass=RuntimeToolMeta):
    """Local tool class."""

    gid = "runtime"
    """Group ID for this tool."""

    @classmethod
    @abstractmethod
    def actions(cls) -> t.List[t.Type[RuntimeAction]]:
        """Get collection of actions for the tool."""


def _create_tool_class(
    name: str,
    actions: t.List[t.Type[RuntimeAction]],
) -> t.Type[RuntimeTool]:
    """Create runtime tool class."""

    class _Tool:
        gid = "runtime"

        @classmethod
        def actions(cls) -> t.List[type[RuntimeAction]]:
            return actions

    _Tool.__doc__ = f"{name.title()} tool."

    return type(inflection.camelize(name), (_Tool, RuntimeTool), dict(_Tool.__dict__))


def _wrap(
    f: t.Callable,
    toolname: str,
    tags: t.List,
    file: str,
    request_schema: t.Type[BaseModel],
    response_schema: t.Type[BaseModel],
    runs_on_shell: bool = False,
    requires: t.Optional[t.List[str]] = None,
) -> t.Type[RuntimeAction]:
    """Wrap action class with given params."""

    _file = file
    _requires = requires

    class WrappedAction(RuntimeAction[request_schema, response_schema]):  # type: ignore
        """Wrapped action class."""

        _tags: t.List[str] = tags

        tool = toolname
        name = f.__name__
        enum = f.__name__.upper()
        display_name = f.__name__

        file = _file
        runtime = True
        requires = _requires
        run_on_shell: bool = runs_on_shell

        data = ActionData(
            name=f.__name__,
            app=toolname.upper(),
            tags=tags,
            no_auth=True,
            is_local=True,
            is_runtime=True,
            shell=run_on_shell,
        )

        def execute(self, request: t.Any, metadata: dict) -> t.Any:
            return f(request, metadata)

    cls = t.cast(
        t.Type[WrappedAction],
        type(inflection.camelize(f.__name__), (WrappedAction,), {}),
    )
    cls.__doc__ = f.__doc__
    cls.description = f.__doc__ or f.__name__  # type: ignore

    # Normalize app name
    toolname = toolname.upper()
    existing_actions = []
    if toolname in tool_registry["runtime"]:
        existing_actions = tool_registry["runtime"][toolname].actions()
    tool = _create_tool_class(name=toolname, actions=[cls, *existing_actions])  # type: ignore
    tool_registry["runtime"][toolname] = tool()
    add_runtime_action(cls.enum, cls.data)
    return cls


def _is_simple_action(argspec: inspect.FullArgSpec) -> bool:
    """Check if the action is defined with `request_data` and `metadata`"""
    if "request" not in argspec.args and "metadata" not in argspec.args:
        return False

    if not issubclass(argspec.annotations["request"], BaseModel):
        raise ValueError("`request_data` needs to be a `pydantic.BaseModel` object")

    if not issubclass(argspec.annotations["return"], BaseModel):
        raise ValueError("Return type needs to be a `pydantic.BaseModel` object")

    return True


def _parse_raw_type(argument: str, annotation: t.Type) -> t.Tuple[t.Type, str]:
    """Parse for raw type."""
    return annotation, " ".join(argument.split("_")).title()


def _parse_annotated_type(
    argument: str, annotation: t.Type
) -> t.Tuple[t.Type, str, t.Any]:
    """Parse for raw type."""
    annottype, *annotspec = t.get_args(annotation)
    if len(annotspec) == 1 and isinstance(annotspec[0], ArgSpec):
        description = annotspec[0].description
        default = annotspec[0].default
    elif len(annotspec) == 1 and isinstance(annotspec[0], str):
        description = annotspec[0]
        default = None
    elif len(annotspec) == 2 and isinstance(annotspec[0], str):
        description = annotspec[0]
        default = annotspec[1]
    else:
        raise ValueError(
            f"Invalid type annotation for argument {argument}: {annotation}"
        )
    return annottype, description, default


def _parse_docstring(
    docstr: str,
) -> t.Tuple[str, t.Dict[str, str], t.Optional[t.Tuple[str, str]]]:
    """Parse docstring for descriptions."""
    header, *descriptions = docstr.lstrip().rstrip().split("\n")
    params = {}
    returns = None
    for description in descriptions:
        if not description:
            continue

        if ":param" in description:
            param, description = description.replace(":param ", "").split(
                ":",
                maxsplit=1,
            )
            params[param.lstrip().rstrip()] = description.lstrip().rstrip()

        if ":return" in description:
            param, description = description.replace(":return ", "").split(
                ":",
                maxsplit=1,
            )
            returns = (param.lstrip().strip(), description.lstrip().rstrip())

    return header, params, returns


def _get_connected_account(
    app: str, entity_id: str
) -> t.Optional[ConnectedAccountModel]:
    try:
        client = Composio.get_latest()
        connected_account = client.connected_accounts.get(
            connection_id=client.get_entity(entity_id).get_connection(app=app).id
        )
        return connected_account
    except ComposioClientError:
        return None


def _get_auth_params(app: str, metadata: t.Dict) -> t.Dict:
    try:
        client = Composio.get_latest()
        connected_account = client.connected_accounts.get(
            connection_id=client.get_entity(metadata["entity_id"])
            .get_connection(app=app)
            .id
        )
        connection_params = connected_account.connectionParams
        return {
            "entity_id": metadata["entity_id"],
            "headers": connection_params.headers,
            "base_url": connection_params.base_url,
            "query_params": connection_params.queryParams,
        }
    except ComposioClientError:
        logging.get_logger().error(
            f"Error fetching auth for runtime action of app {app!r}, "
            "connected account for this account does not exist!"
        )
        return {
            "entity_id": metadata["entity_id"],
            "subdomain": metadata.pop("subdomain", {}),
            "headers": metadata.pop("header", {}),
            "base_url": metadata.pop("base_url", None),
            "body_params": metadata.pop("body", {}),
            "path_params": metadata.pop("path", {}),
            "query_params": metadata.pop("query", {}),
            **metadata,
        }


def _build_executable_from_args(  # pylint: disable=too-many-statements
    f: t.Callable,
    app: str,
) -> t.Tuple[t.Callable, t.Type[BaseModel], t.Type[BaseModel], bool]:
    """Build execute action from function arguments."""
    argspec = inspect.getfullargspec(f)
    missing_annot = set(argspec.args) - set(argspec.annotations)
    if len(missing_annot) > 0:
        raise InvalidRuntimeAction(
            message=f"Following arguments are missing type annotations: {missing_annot}"
        )

    defaults = dict(
        zip(
            reversed(argspec.annotations),
            reversed(argspec.defaults or []),
        )
    )
    docstr = getattr(f, "__doc__")
    if docstr is None:
        raise InvalidRuntimeAction(
            message=f"Runtime action `{f.__name__}` is missing docstring"
        )

    header, paramdesc, returns = _parse_docstring(
        docstr=docstr,
    )
    request_schema: t.Dict[str, t.Any] = {
        "__annotations__": {},
    }
    response_schema: t.Dict[str, t.Any] = {
        "__annotations__": {},
    }

    shell_argument = None
    auth_param = False
    connected_account_param = False
    request_executor = False
    if "return" not in argspec.annotations:
        raise InvalidRuntimeAction(
            f"Please add return type on runtime action `{f.__name__}`"
        )

    for arg, annot in argspec.annotations.items():
        if annot is Shell:
            shell_argument = arg
            continue

        if arg == "auth":
            auth_param = True
            continue

        if arg == "connected_account":
            connected_account_param = True
            continue

        if arg == "execute_request":
            request_executor = True
            continue

        if isinstance(annot, te._AnnotatedAlias):  # pylint: disable=protected-access
            annottype, description, default = _parse_annotated_type(
                argument=arg,
                annotation=annot,
            )
            default = defaults.get(arg, default)
        else:
            annottype, _ = _parse_raw_type(argument=arg, annotation=annot)
            if arg != "return" and arg not in paramdesc:
                raise InvalidRuntimeAction(
                    f"Please provide description for `{arg}` on runtime action `{f.__name__}`"
                )

            if arg == "return":
                if returns is None:
                    raise InvalidRuntimeAction(
                        f"Please provide description for `{arg}` on runtime action `{f.__name__}`"
                    )
                _, description = returns
            else:
                description = paramdesc[arg]

            default = defaults.get(arg, ...)
        if arg == "return":
            if returns is not None:
                arg, _ = returns
            else:
                arg = "result"
            response_schema[arg] = Field(default=default, description=description)
            response_schema["__annotations__"][arg] = annottype
            continue

        request_schema[arg] = Field(default=default, description=description)
        request_schema["__annotations__"][arg] = annottype

    RequestSchema = type(
        f"{inflection.camelize(f.__name__)}Request",
        (BaseModel,),
        request_schema,
    )

    ResponseSchema = type(
        f"{inflection.camelize(f.__name__)}Response",
        (BaseModel,),
        response_schema,
    )

    def execute(request: BaseModel, metadata: t.Dict) -> BaseModel:
        """Wrapper for action callable."""
        kwargs = request.model_dump()
        if shell_argument is not None:
            kwargs[shell_argument] = metadata["workspace"].shells.recent

        if connected_account_param:
            kwargs["connected_account"] = (
                _get_connected_account(app=app, entity_id=metadata["entity_id"]) or {}
            )
        if auth_param:
            kwargs["auth"] = _get_auth_params(app=app, metadata=metadata)

        if request_executor:
            toolset = t.cast("ComposioToolSet", metadata["_toolset"])

            def execute_request(
                endpoint: str,
                method: str,
                body: t.Optional[t.Dict] = None,
                parameters: t.Optional[t.List[CustomAuthParameter]] = None,
            ):
                return toolset.execute_request(
                    endpoint=endpoint,
                    method=method,
                    body=body,
                    app=app,
                    parameters=parameters,
                )

            kwargs["execute_request"] = execute_request

        response = f(**kwargs)
        if isinstance(response, BaseModel):
            return response

        rname = returns[0] if returns is not None else "result"
        return ResponseSchema(**{rname: response})

    execute.__doc__ = header
    execute.__name__ = f.__name__
    return (
        execute,
        RequestSchema,
        ResponseSchema,
        shell_argument is not None,
    )


def _build_executable_from_request_class(f: t.Callable, app: str) -> t.Callable:
    def execute(request: BaseModel, metadata: t.Dict) -> BaseModel:
        """Wrapper for action callable."""
        auth_data = _get_auth_params(app=app, metadata=metadata)
        if auth_data is not None:
            metadata.update(auth_data)
        return f(request, metadata)

    execute.__name__ = f.__name__
    execute.__doc__ = f.__doc__
    return execute


def _parse_schemas(
    f: t.Callable, app: str, runs_on_shell: bool
) -> t.Tuple[t.Callable, t.Type[BaseModel], t.Type[BaseModel], bool]:
    """Parse action callable schemas."""
    argspec = inspect.getfullargspec(f)
    if _is_simple_action(argspec=argspec):
        return (
            _build_executable_from_request_class(f=f, app=app),
            argspec.annotations["request"],
            argspec.annotations["return"],
            runs_on_shell,
        )
    return _build_executable_from_args(f=f, app=app)


def action(
    toolname: str,
    runs_on_shell: bool = False,
    requires: t.Optional[t.List] = None,
    tags: t.Optional[t.List[str]] = None,
) -> t.Callable[[t.Callable], t.Type[RuntimeAction]]:
    """Marks a callback as wanting to receive the current context object as first argument."""

    def wrapper(f: t.Callable) -> t.Type[RuntimeAction]:
        """Action wrapper."""
        file = inspect.getfile(f)
        f, request_schema, response_schema, _runs_on_shell = _parse_schemas(
            f=f,
            app=toolname,
            runs_on_shell=runs_on_shell,
        )
        return _wrap(
            f=f,
            toolname=toolname,
            tags=tags or [],
            file=file,
            request_schema=request_schema,
            response_schema=response_schema,
            runs_on_shell=_runs_on_shell,
            requires=requires,
        )

    return wrapper
