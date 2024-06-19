"""
CLI Context.
"""

import typing as t
from functools import update_wrapper
from pathlib import Path

import click
import typing_extensions as te
from click.globals import get_current_context as get_click_context
from rich.console import Console

from composio.client import Composio
from composio.constants import LOCAL_CACHE_DIRECTORY_NAME, USER_DATA_FILE_NAME
from composio.storage.user import UserData


_context: t.Optional["Context"] = None


class Context:
    """Runtime Context for Compsio CLI tool."""

    _client: t.Optional[Composio] = None
    _user_data: t.Optional[UserData] = None
    _cache_dir: t.Optional[Path] = None
    _console: t.Optional[Console] = None

    using_api_key_from_env: bool = False

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
            self._cache_dir = Path.home() / LOCAL_CACHE_DIRECTORY_NAME
        if not self._cache_dir.exists():
            self._cache_dir.mkdir(parents=True)
        return self._cache_dir

    @property
    def user_data(self) -> UserData:
        """User data."""
        path = self.cache_dir / USER_DATA_FILE_NAME
        if not path.exists():
            self._user_data = UserData(path=path)
            self._user_data.store()

        if self._user_data is None:
            self._user_data = UserData.load(path=path)
        return self._user_data

    @property
    def client(self) -> Composio:
        """Composio client."""
        if self._client is None:
            self._client = Composio(
                api_key=self.user_data.api_key,
            )
        return self._client

    def is_logged_in(self) -> bool:
        """Check if a user is logged in."""
        return self.user_data.api_key is not None


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
    """Marks a callback as wanting to receive the current context object as first argument."""
    global _context
    if _context is None:
        _context = Context()

    def wapper(*args: P.args, **kwargs: P.kwargs) -> R:
        if not t.cast(Context, _context).is_logged_in():
            raise click.ClickException(
                message="User not logged in, please login using `composio login`",
            )
        return f(*args, **kwargs)

    return update_wrapper(wapper, f)
