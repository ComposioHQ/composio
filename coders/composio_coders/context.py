"""
composio-coder CLI Context.
"""

import os
import typing as t
from functools import update_wrapper
from pathlib import Path

import click
import typing_extensions as te
from click.globals import get_current_context as get_click_context
from rich.console import Console

from composio_coders.constants import LOCAL_CACHE_DIRECTORY_NAME, MODEL_ENV_PATH, ISSUE_CONFIG_PATH
from composio_coders.config_store import ModelEnvConfig, IssueConfig, OpenAiModelConfig, AzureModelConfig
from composio_coders.constants import KEY_MODEL_ENV, MODEL_ENV_AZURE, MODEL_ENV_OPENAI, KEY_AZURE_ENDPOINT, KEY_API_KEY, LOGS_DIR

_context: t.Optional["Context"] = None


class Context:
    """Context for composio-coder"""
    _cache_dir: t.Optional[Path] = None
    _console: t.Optional[Console] = None
    _model_env: t.Optional[ModelEnvConfig] = None
    _issue_config: t.Optional[IssueConfig] = None

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
    def agent_logs_dir(self) -> Path:
        path = self.cache_dir / LOGS_DIR
        if not path.exists():
            path.mkdir(parents=True)
        return path

    @property
    def model_env(self) -> ModelEnvConfig:
        """Model environment configuration."""
        if self._model_env:
            return self._model_env
        path = self.cache_dir / MODEL_ENV_PATH
        self._model_env = ModelEnvConfig.load(path=path)
        if not path.exists():
            raise ValueError("model env config path not found !!!")
        return self._model_env

    @model_env.setter
    def model_env(self, config: t.Dict)-> None:
        path = self.cache_dir / MODEL_ENV_PATH
        model_config: t.Optional[ModelEnvConfig] = None
        if config.get(KEY_MODEL_ENV) == MODEL_ENV_OPENAI:
            model_config = OpenAiModelConfig(path=path, model_env=MODEL_ENV_OPENAI, api_key=config[KEY_API_KEY])
        elif config.get(KEY_MODEL_ENV) == MODEL_ENV_AZURE:
            model_config = AzureModelConfig(path=path, model_env=MODEL_ENV_AZURE, api_key=config[KEY_API_KEY],
                                            KEY_AZURE_ENDPOINT=config[KEY_AZURE_ENDPOINT])
        else:
            raise ValueError(f"only these llms are supported {MODEL_ENV_OPENAI} and {MODEL_ENV_AZURE}")
        self._model_env = model_config
        self._model_env.store()
    
    @property
    def issue_config(self) -> IssueConfig:
        """Get the issue configuration, loading it if not already loaded."""
        if self._issue_config:
            return self._issue_config

        path = self.cache_dir / ISSUE_CONFIG_PATH
        if path.exists():
            self._issue_config = IssueConfig.load(path=path)
            return self._issue_config
        raise ValueError("issue config not set")

    @issue_config.setter
    def issue_config(self, config: t.Dict) -> None:
        """Set Issue configuration."""
        path = self.cache_dir / ISSUE_CONFIG_PATH
        issue_config = IssueConfig(path=path, repo_name=config["repo_name"],
                                   repo_init_from="", issue_id=config["issue_id"],
                                   base_commit_id=config["base_commit_id"],
                                   issue_desc=config["issue_desc"])
        self._issue_config = issue_config
        self._issue_config.store()
        


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