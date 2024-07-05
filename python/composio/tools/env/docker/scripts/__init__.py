"""
Runtime scripts for the swe-agent docker image.
"""

import typing as t
from pathlib import Path

from pydantic import BaseModel, Field


PATH = Path(__file__).parent

T = t.TypeVar("T", str, bytes)


class Command(BaseModel):
    name: str = Field(
        ...,
        description="name of the command",
    )
    code: str = Field(
        ...,
        description="code to run for that command",
    )


class CommandFile(BaseModel, t.Generic[T]):
    datum: T = Field(
        ...,
        description="file content for the command file",
    )
    cmd_type: str = Field(
        ...,
        description="command type one of - source_file, script,",
    )
    name: str = Field(
        ...,
        description="name of the command file on the workspace",
    )


class ShellEnvironment(BaseModel):
    """
    State of the workspace environment, will be used to specify

    - init env for a workspace
    - set a workspace to some defined env-state
    """

    env_variables: t.Dict[str, t.Any] = Field(
        default={},
        description="env-variables needed to set",
    )
    init_scripts: t.List[str] = Field(
        default=[],
        description="init scripts needs to run on the workspace",
    )
    copy_file_to_workspace: t.List[CommandFile] = Field(
        default=[],
        description="list of command files to copy on workspace",
    )
    commands_to_execute: t.List[str] = Field(
        default=[],
        description="commands to execute to setup the env",
    )
    setup_cmd: str = Field(
        default="",
        description="setup command for the workspace",
    )


SHELL_ENV_VARS = {
    "WINDOW": 100,
    "OVERLAP": 2,
    "CURRENT_LINE": 0,
    "CURRENT_FILE": "",
    "SEARCH_RESULTS": (),
    "SEARCH_FILES": (),
    "SEARCH_INDEX": 0,
}

SHELL_STATE_CMD = """state() {
    echo '{"working_dir": "'$(realpath --relative-to=$ROOT/.. $PWD)'"}';
};"""


SHELL_INITIAL_COMMANDS = (
    [SHELL_STATE_CMD]
    + ["pip install flake8"]
    + [f"{k}={v}" for k, v in SHELL_ENV_VARS.items()]
)

SHELL_SOURCE_FILES = (
    PATH / "commands" / "defaults.sh",
    PATH / "commands" / "search.sh",
    PATH / "commands" / "edit.sh",
)

SHELL_SCRIPTS = (PATH / "commands" / "_split_string.py",)


def get_shell_env() -> ShellEnvironment:
    """Get shell environment for running SWE agent."""
    formatted = []
    for file in (*SHELL_SOURCE_FILES, *SHELL_SCRIPTS):
        contents = file.read_text(encoding="utf-8")
        if contents.strip().startswith("#!"):
            name, *_ = Path(file).name.rsplit(".", 1)
            formatted.append(
                CommandFile(
                    datum=contents,
                    cmd_type="script",
                    name=name,
                )
            )
            continue

        if file.name.endswith(".sh"):
            filetype = "source_file"
        elif file.name.startswith("_"):
            filetype = "utility"
        else:
            raise ValueError(
                (
                    f"Non-shell script file {file} does not start with "
                    "shebang.\nEither add a shebang (#!) or change the "
                    "file extension to .sh if you want to source it.\n"
                    "You can override this behavior by adding an underscore "
                    "to the file name (e.g. _utils.py)."
                )
            )
        formatted.append(
            CommandFile(
                datum=contents,
                cmd_type=filetype,
                name=file.name,
            )
        )
    return ShellEnvironment(
        copy_file_to_workspace=formatted,
        commands_to_execute=SHELL_INITIAL_COMMANDS,
        setup_cmd=SHELL_STATE_CMD,
    )
