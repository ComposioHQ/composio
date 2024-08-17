"""Decorators for local tools."""

import inspect
import typing as t

import inflection
from pydantic import BaseModel, Field

from composio.client.enums import Action
from composio.client.enums.base import ActionData
from composio.tools.env.base import Shell
from composio.tools.local.handler import add_runtime_action
from composio.utils.enums import get_enum_key

from .action import Action as LocalAction


ActionCallable = t.Callable


class ArgSpec(BaseModel):
    """Argument specification."""

    description: str
    """Description of the argument variable."""

    default: t.Any = None
    """Default value"""


def _wrap(
    f: t.Callable,
    toolname: str,
    tags: t.List,
    request_schema: t.Type[BaseModel],
    response_schema: t.Type[BaseModel],
    runs_on_shell: bool = False,
    requires: t.Optional[t.List[str]] = None,
    file: t.Optional[str] = None,
) -> t.Type[LocalAction]:
    """Wrap action class with given params."""

    _requires = requires

    class WrappedAction(LocalAction):
        """Wrapped action class."""

        _tags: t.List[str] = tags
        _tool_name: str = toolname
        _display_name: str = f.__name__

        _request_schema = request_schema
        _response_schema = response_schema

        _history_maintains: bool = False
        run_on_shell: bool = runs_on_shell
        requires = _requires
        module = file

        def execute(self, request_data: t.Any, authorisation_data: dict) -> t.Any:
            return f(request_data, authorisation_data)

    cls = type(inflection.camelize(f.__name__), (WrappedAction,), {})
    cls.__doc__ = f.__doc__

    instance = cls()
    Action.add(
        name=get_enum_key(name=instance.get_tool_merged_action_name()),
        data=ActionData(
            name=instance.action_name,
            app=instance.tool_name,
            tags=tags or [],
            no_auth=True,
            is_local=True,
            is_runtime=True,
            shell=runs_on_shell,
        ),
    )
    add_runtime_action(
        name=instance.action_name,
        cls=cls,
    )
    return cls


def _is_simple_action(argspec: inspect.FullArgSpec) -> bool:
    """Check if the action is defined with `request_data` and `metadata`"""
    if "request_data" not in argspec.args and "metadata" not in argspec.args:
        return False

    if not issubclass(argspec.annotations["request_data"], BaseModel):
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
    header, paramdesc, returns = _parse_docstring(
        docstr=getattr(f, "__doc__"),
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
        if getattr(annot, "__name__", "") == "Annotated":
            annottype, description, default = _parse_annotated_type(
                argument=arg,
                annotation=annot,
            )
        else:
            annottype, description = _parse_raw_type(argument=arg, annotation=annot)
            description = paramdesc.get(arg, description)
            default = defaults.get(arg, ...)
            if arg == "return" and returns is not None:
                _, description = returns

        if arg == "return":
            if returns is not None:
                arg, _ = returns
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

    def execute(request_data: BaseModel, metadata: t.Dict) -> BaseModel:
        """Wrapper for action callable."""
        kwargs = request_data.model_dump()
        if shell_argument is not None:
            kwargs[shell_argument] = metadata["workspace"].shells.recent

        response = f(**kwargs)
        if isinstance(response, BaseModel):
            return response

        rname = returns[0] if returns is not None else "return"
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
            argspec.annotations["request_data"],
            argspec.annotations["return"],
            runs_on_shell,
        )
    return _build_executable_from_args(f=f)


def action(
    toolname: str,
    runs_on_shell: bool = False,
    tags: t.Optional[t.List[str]] = None,
    requires: t.Optional[t.List] = None,
) -> t.Callable[[ActionCallable], t.Type[LocalAction]]:
    """Marks a callback as wanting to receive the current context object as first argument."""

    def wrapper(f: ActionCallable) -> t.Type[LocalAction]:
        """Action wrapper."""
        file = inspect.getfile(f)
        f, RequestSchema, ResponseSchema, _runs_on_shell = _parse_schemas(
            f=f,
            runs_on_shell=runs_on_shell,
        )
        return _wrap(
            f=f,
            toolname=toolname,
            tags=tags or [],
            request_schema=RequestSchema,
            response_schema=ResponseSchema,
            runs_on_shell=_runs_on_shell,
            requires=requires,
            file=file,
        )

    return wrapper
