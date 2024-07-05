"""Decorators for local tools."""

import inspect
import typing as t

import inflection
from pydantic import BaseModel

from composio.client.enums import Action
from composio.client.enums.base import ActionData
from composio.tools.local.handler import add_runtime_action
from composio.utils.enums import get_enum_key

from .action import Action as LocalAction


RequestType = t.TypeVar("RequestType", bound=BaseModel)
ResponseType = t.TypeVar("ResponseType", bound=BaseModel)

ActionCallable = t.Callable[[RequestType, t.Dict], ResponseType]


def action(
    toolname: str,
    requires_shell: bool = False,
    tags: t.Optional[t.List[str]] = None,
) -> t.Callable[[ActionCallable], t.Type[LocalAction]]:
    """Marks a callback as wanting to receive the current context object as first argument."""

    def wrapper(f: ActionCallable) -> t.Type[LocalAction]:
        """Action wrapper."""

        argspec = inspect.getfullargspec(f)
        if (
            len(argspec.args) != 2
            or "request_data" not in argspec.args
            or "metadata" not in argspec.args
        ):
            raise ValueError(
                "A action should have only `request_data`, `metadata` as arguments"
            )

        RequestSchema = argspec.annotations["request_data"]
        if not issubclass(RequestSchema, BaseModel):
            raise ValueError("`request_data` needs to be a `pydantic.BaseModel` object")

        ResponseSchema = argspec.annotations["return"]
        if not issubclass(ResponseSchema, BaseModel):
            raise ValueError("Return type needs to be a `pydantic.BaseModel` object")

        class WrappedAction(LocalAction):
            """Wrapped action class."""

            _tags: t.List[str] = tags or []
            _tool_name: str = toolname
            _display_name: str = f.__name__

            _request_schema = RequestSchema
            _response_schema = ResponseSchema

            _history_maintains: bool = False
            run_on_shell = requires_shell

            def execute(
                self,
                request_data: t.Any,
                authorisation_data: dict,
            ) -> t.Any:
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
            ),
        )
        add_runtime_action(
            name=instance.action_name,
            cls=cls,
        )
        return cls

    return wrapper
