"""Tool abstractions."""

import inspect
import typing as t
from abc import abstractmethod

import inflection
import typing_extensions as te
from pydantic import BaseModel, Field

from composio.client.enums.base import ActionData, SentinalObject, add_runtime_action
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
    cls.description = f.__doc__  # type: ignore

    existing_actions = []
    toolname = toolname.upper()
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
) -> t.Tuple[str, t.Dict[str, str], t.Optional[t.Tuple[str, str]],]:
    """Parse docstring for descriptions."""
    header, *descriptions = docstr.lstrip().rstrip().split("\n")
    params = {}
    returns = None
    for description in descriptions:
        if not description:
            continue

        if ":param" in description:
            param, description = description.replace(":param ", "").split(":")
            params[param.lstrip().rstrip()] = description.lstrip().rstrip()

        if ":return" in description:
            param, description = description.replace(":return ", "").split(":")
            returns = (param.lstrip().strip(), description.lstrip().rstrip())

    return header, params, returns


def _build_executable_from_args(
    f: t.Callable,
) -> t.Tuple[t.Callable, t.Type[BaseModel], t.Type[BaseModel], bool,]:
    """Build execute action from function arguments."""
    argspec = inspect.getfullargspec(f)
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
    for arg, annot in argspec.annotations.items():
        if annot is Shell:
            shell_argument = arg
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


def _parse_schemas(
    f: t.Callable, runs_on_shell: bool
) -> t.Tuple[t.Callable, t.Type[BaseModel], t.Type[BaseModel], bool,]:
    """Parse action callable schemas."""
    argspec = inspect.getfullargspec(f)
    if _is_simple_action(argspec=argspec):
        return (
            f,
            argspec.annotations["request"],
            argspec.annotations["return"],
            runs_on_shell,
        )
    return _build_executable_from_args(f=f)


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
