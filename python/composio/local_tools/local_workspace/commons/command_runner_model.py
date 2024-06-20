from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from simple_parsing.helpers.fields import field
from simple_parsing.helpers.serialization.serializable import FrozenSerializable


@dataclass(frozen=True)
class Subroutine(FrozenSerializable):
    name: str
    agent_file: str
    # one of "action", "observation", "response", "state", "thought"
    return_type: str = None  # type: ignore
    init_observation: Optional[str] = None
    end_name: Optional[str] = None
    signature: Optional[str] = None
    docstring: Optional[str] = None
    agent_args: Optional[Any] = None


@dataclass(frozen=True)
class Command(FrozenSerializable):
    code: str
    name: str
    docstring: Optional[str] = None
    end_name: Optional[
        str
    ] = None  # if there is an end_name, then it is a multi-line command
    arguments: Optional[Dict] = None
    signature: Optional[str] = None


@dataclass(frozen=True)
class AgentConfig(FrozenSerializable):
    system_template: str
    instance_template: str
    next_step_template: Optional[str] = None  # defaults to instance_template
    next_step_no_output_template: Optional[str] = None  # defaults to next_step_template
    strategy_template: Optional[str] = None
    # defaults to format_error_template in ParseFunction
    format_error_template: str = None  # type: ignore
    command_files: list[str] = field(default_factory=list)
    env_variables: dict[str, str] = field(default_factory=dict)
    util_functions: list[str] = field(default_factory=list)
    submit_command: str = "submit"
    parse_function: str = "ThoughtActionParser"
    parse_command: str = "ParseCommandBash"
    history_processor: str = "DefaultHistoryProcessor"
    history_processor_args: dict[str, Any] = field(default_factory=dict)
    command_docs: str = None  # type: ignore
    blocklist_error_template: str = (
        "Interactive operation '{name}' is not supported by this environment"
    )
    blocklist: Tuple[str, ...] = (
        "vim",
        "vi",
        "emacs",
        "nano",
        "nohup",
        "git",
    )
    blocklist_standalone: Tuple[str, ...] = (
        "python",
        "python3",
        "ipython",
        "bash",
        "sh",
        "exit",
        "/bin/bash",
        "/bin/sh",
        "nohup",
        "vi",
        "vim",
        "emacs",
        "nano",
    )
    # Should extract environment state in a json readable form
    state_command: Command = Command(
        name="state",
        code="""state() {
            echo '{"working_dir": "'$(realpath --relative-to=$ROOT/.. $PWD)'"}';
        };""",
    )
    _commands: list[Command] = field(default_factory=list)
    _subroutines: dict[str, Subroutine] = field(default_factory=dict)
    subroutine_types: list[Subroutine] = field(default_factory=list)
    multi_line_command_endings: dict[str, str] = field(default_factory=dict)
