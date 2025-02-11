"""
CLI Context.
"""

import os
import typing as t
import webbrowser
from functools import update_wrapper
from pathlib import Path

import click
import typing_extensions as te
from click.globals import get_current_context as get_click_context
from rich.console import Console

from composio.client import Composio
from composio.constants import (
    ENV_COMPOSIO_API_KEY,
    LOCAL_CACHE_DIRECTORY,
    USER_DATA_FILE_NAME,
)
from composio.storage.user import UserData
from composio.tools.env.factory import WorkspaceType
from composio.tools.toolset import ComposioToolSet
from composio.utils import logging
from composio.utils.url import get_web_url


_context: t.Optional["Context"] = None


class Context(logging.WithLogger):
    """Runtime Context for Compsio CLI tool."""

    _client: t.Optional[Composio] = None
    _toolset: t.Optional[ComposioToolSet] = None
    _user_data: t.Optional[UserData] = None
    _cache_dir: t.Optional[Path] = None
    _console: t.Optional[Console] = None

    _is_logged_in: t.Optional[bool] = None
    _using_api_key_from_env: bool = False

    @property
    def click_ctx(self) -> click.Context:
        """Click runtime context."""
        return get_click_context()

    @property
    def console(self) -> Console:
        """CLI Console."""
        if self._console is None:
            self._console = Console()
        return self._console

    @property
    def cache_dir(self) -> Path:
        """Cache directory."""
        if self._cache_dir is None:
            self._cache_dir = LOCAL_CACHE_DIRECTORY
        if not self._cache_dir.exists():
            self._cache_dir.mkdir(parents=True)
        return self._cache_dir

    @property
    def user_data(self) -> UserData:
        """User data."""
        if self._user_data is not None:
            return self._user_data

        path = self.cache_dir / USER_DATA_FILE_NAME
        if not path.exists():
            self._user_data = UserData(path=path)
            self._user_data.store()

        self._is_logged_in = False
        if self._user_data is None:
            self._user_data = UserData.load(path=path)
            if self._user_data.api_key is not None:
                self._is_logged_in = True

        api_key_from_env = os.environ.get(ENV_COMPOSIO_API_KEY)
        if api_key_from_env is not None:
            self._using_api_key_from_env = True
            self._user_data.api_key = api_key_from_env

        return self._user_data

    @property
    def client(self) -> Composio:
        """Composio client."""
        if self._client is None:
            self._client = Composio(api_key=self.user_data.api_key)
        return self._client

    @property
    def toolset(self) -> ComposioToolSet:
        """Composio toolset."""
        if self._toolset is None:
            self._toolset = ComposioToolSet(
                api_key=self.user_data.api_key,
                workspace_config=WorkspaceType.Host(),
            )
        return self._toolset

    def using_api_key_from_env(self) -> bool:
        """Check if API Key being used was parsed from the environment"""
        return self._using_api_key_from_env

    def is_logged_in(self) -> bool:
        """Check if a user is logged in."""
        if self._is_logged_in is None:
            _ = self.user_data
        return t.cast(bool, self._is_logged_in)


R = t.TypeVar("R")
T = t.TypeVar("T")
P = te.ParamSpec("P")
F = t.TypeVar("F", bound=t.Union[t.Callable[..., t.Any], click.Command, click.Group])


def pass_context(f: t.Callable[te.Concatenate[Context, P], R]) -> t.Callable[P, R]:
    """Marks a callback as wanting to receive the current context object as first argument."""

    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        return f(get_context(), *args, **kwargs)

    return update_wrapper(wrapper, f)


def get_context() -> Context:
    """Get runtime context."""
    global _context
    if _context is None:
        _context = Context()
    return _context


def set_context(context: Context) -> None:
    """Set runtime context."""
    global _context
    _context = context


def login_required(f: t.Callable[te.Concatenate[P], R]) -> t.Callable[P, R]:
    """Marks a callback to raise failure if the user is not logged in."""
    global _context
    if _context is None:
        _context = Context()

    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        if (
            not t.cast(Context, _context).is_logged_in()
            and not t.cast(Context, _context).using_api_key_from_env()
        ):
            raise click.ClickException(
                message="User not logged in, please login using `composio login`",
            )
        return f(*args, **kwargs)

    return update_wrapper(wrapper, f)


def ensure_login(f: t.Callable[te.Concatenate[P], R]) -> t.Callable[P, R]:
    """Marks a callback to login first, if an user is not logged in."""
    global _context
    if _context is None:
        _context = Context()

    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        if (
            not t.cast(Context, _context).is_logged_in()
            and not t.cast(Context, _context).using_api_key_from_env()
        ):
            login(context=_context)
        return f(*args, **kwargs)

    return update_wrapper(wrapper, f)


def login(
    context: t.Optional[Context],
    no_browser: bool = False,
):
    if context is None:
        context = Context()
    key = Composio.generate_auth_key()
    url = get_web_url(path=f"?cliKey={key}")
    context.console.print(
        "> Please login using the following link"
        if no_browser
        else "> Redirecting you to the login page"
    )
    context.console.print(f"> [green]{url}[/green]")
    if not no_browser:
        webbrowser.open(url)
    code = click.prompt("> Enter authentication code")
    api_key = Composio.validate_auth_session(
        key=key,
        code=code,
    )
    if context.using_api_key_from_env() and api_key != context.user_data.api_key:
        context.console.print(
            "> [yellow]WARNING: API Key from environment does not match "
            "with the one retrieved from login[/yellow]"
        )
    context.user_data.api_key = api_key
    context.user_data.store()
    context.console.print("✔ [green]Authenticated successfully![/green]")
