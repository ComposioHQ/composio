import importlib
import inspect
import typing as t
from itertools import chain
from pathlib import Path

from pydantic import BaseModel

from .abs import Tool


class AuthScheme(BaseModel):
    """Auth scheme model for auth config."""

    scheme_name: str
    auth_mode: str
    authorization_url: str
    token_url: str
    default_scopes: t.List[str]
    authorization_params: dict
    proxy: dict
    token_params: dict


class AppConfig(BaseModel):
    """App config for composio tool."""

    name: str
    docs: str
    unique_key: str
    description: str
    logo: str
    categories: t.List[str]
    get_current_user_endpoint: str
    auth_schemes: t.List[AuthScheme]


class ApiToolMeta(type):
    """Tool metaclass."""

    def __init__(
        cls,
        name: str,
        bases: t.Tuple,
        dict_: t.Dict,
        autoload: bool = False,
    ) -> None:
        """Initialize action class."""
        if name == "APITool":
            return

        cls = t.cast(t.Type[APITool], cls)
        for method in ("actions", "triggers"):
            if getattr(getattr(cls, method), "__isabstractmethod__", False):
                raise RuntimeError(f"Please implement {name}.{method}")

            if not inspect.ismethod(getattr(cls, method)):
                raise RuntimeError(f"Please implement {name}.{method} as class method")

        gid = getattr(cls, "gid", None)
        if gid is None:
            gid = "default"

        cls.gid = gid
        cls.name = getattr(cls, "mame", cls.display_name())
        cls.file = Path(inspect.getfile(cls))
        cls.config = _load_config(cls)
        cls.description = (cls.__doc__ or cls.config.description).lstrip().rstrip()

        for loadable in chain(cls.actions(), cls.triggers()):
            loadable.tool = cls.name

        if autoload:
            cls.register()


class APITool(Tool, metaclass=ApiToolMeta):
    """API tool metaclass."""

    config: "AppConfig"
    """Auth config."""

    @classmethod
    def _generate_schema(cls) -> None:
        """Generate app schema."""
        super()._generate_schema()
        t.cast(t.Dict, cls._schema)["Integration"] = cls.config.model_dump()


def _load_config(cls) -> "AppConfig":
    """Load app config."""
    return t.cast(
        AppConfig,
        importlib.import_module(
            ".".join([*cls.__module__.split(".")[:-1], "config"])
        ).config,
    )
