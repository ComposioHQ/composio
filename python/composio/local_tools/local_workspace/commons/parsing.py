import re
from abc import abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import yaml
from simple_parsing.helpers.serialization.serializable import FrozenSerializable


@dataclass(frozen=True)
class AssistantMetadata(FrozenSerializable):
    """Pass observations to the assistant, and get back a response."""

    system_template: Optional[str] = None
    instance_template: Optional[str] = None


# TODO: first can be used for two-stage actions
# TODO: eventually might control high-level control flow
@dataclass(frozen=True)
class ControlMetadata(FrozenSerializable):
    """TODO: should be able to control high-level control flow after calling this command"""

    next_step_template: Optional[str] = None
    next_step_action_template: Optional[str] = None


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


class ParseCommandMeta(type):
    _registry: dict[str, "ParseCommand"] = {}

    def __new__(cls, name, bases, attrs):  # pylint: disable=C0204
        new_cls = super().__new__(cls, name, bases, attrs)
        if name != "ParseCommand":
            cls._registry[name] = new_cls
        return new_cls


@dataclass
class ParseCommand(metaclass=ParseCommandMeta):
    @classmethod
    def get(cls, name):
        try:
            return cls._registry[name]()
        except KeyError as exc:
            raise ValueError(f"Command parser ({name}) not found.") from exc

    @abstractmethod
    def parse_command_file(self, path: str) -> List[Command]:
        """
        Define how to parse a file into a list of commands.
        """
        raise NotImplementedError

    @abstractmethod
    def generate_command_docs(
        self, commands: List[Command], subroutine_types, **kwargs
    ) -> str:
        """
        Generate a string of documentation for the given commands and subroutine types.
        """
        raise NotImplementedError


class ParseCommandBash(ParseCommand):
    def parse_command_file(self, path: str) -> List[Command]:
        with open(path, "r", encoding="utf-8") as f:
            contents = f.read()
        if contents.strip().startswith("#!"):
            commands = self.parse_script(path, contents)
        else:
            if not path.endswith(".sh") and not Path(path).name.startswith("_"):
                raise ValueError(
                    (
                        f"Source file {path} does not have a .sh extension.\n"
                        "Only .sh files are supported for bash function parsing.\n"
                        "If you want to use a non-shell file as a command (script), "
                        "it should use a shebang (e.g. #!/usr/bin/env python)."
                    )
                )
            return self.parse_bash_functions(path, contents)
        if len(commands) == 0 and not Path(path).name.startswith("_"):
            raise ValueError(
                (
                    f"Non-shell file {path} does not contain any commands.\n"
                    "If you want to use a non-shell file as a command (script), "
                    "it should contain exactly one @yaml docstring. "
                    "If you want to use a file as a utility script, "
                    "it should start with an underscore (e.g. _utils.py)."
                )
            )
        return commands

    def parse_bash_functions(self, _path, contents) -> List[Command]:
        """
        Simple logic for parsing a bash file and segmenting it into functions.

        Assumes that all functions have their name and opening curly bracket in one line,
        and closing curly bracket in a line by itself.
        """
        lines = contents.split("\n")
        commands = []
        idx = 0
        docs = []
        while idx < len(lines):  # pylint: disable=too-many-nested-blocks
            line = lines[idx]
            idx += 1
            if line.startswith("# "):
                docs.append(line[2:])
            elif line.strip().endswith("() {"):
                name = line.split()[0][:-2]
                code = line
                while lines[idx].strip() != "}":
                    code += lines[idx]
                    idx += 1
                code += lines[idx]
                docstring, end_name, arguments, signature = None, None, None, name
                docs_dict = yaml.safe_load("\n".join(docs).replace("@yaml", ""))
                if docs_dict is not None:
                    docstring = docs_dict["docstring"]
                    end_name = docs_dict.get("end_name", None)
                    arguments = docs_dict.get("arguments", None)
                    if "signature" in docs_dict:
                        signature = docs_dict["signature"]
                    else:
                        if arguments is not None:
                            for param, settings in arguments.items():
                                if settings["required"]:
                                    signature += f" <{param}>"
                                else:
                                    signature += f" [<{param}>]"
                command = Command.from_dict(
                    {
                        "code": code,
                        "docstring": docstring,
                        "end_name": end_name,
                        "name": name,
                        "arguments": arguments,
                        "signature": signature,
                    }
                )
                commands.append(command)
                docs = []
        return commands

    def parse_script(self, path, contents) -> List[Command]:
        pattern = re.compile(r"^#\s*@yaml\s*\n^#.*(?:\n#.*)*", re.MULTILINE)
        matches = pattern.findall(contents)
        if len(matches) == 0:
            return []
        if len(matches) > 1:
            raise ValueError(
                (
                    "Non-shell file contains multiple @yaml tags.\n"
                    "Only one @yaml tag is allowed per script."
                )
            )
        yaml_content = matches[0]
        yaml_content = re.sub(r"^#", "", yaml_content, flags=re.MULTILINE)
        docs_dict = yaml.safe_load(yaml_content.replace("@yaml", ""))
        assert docs_dict is not None
        docstring = docs_dict["docstring"]
        end_name = docs_dict.get("end_name", None)
        arguments = docs_dict.get("arguments", None)
        signature = docs_dict.get("signature", None)
        name = Path(path).name.rsplit(".", 1)[0]
        if signature is None and arguments is not None:
            signature = name
            for param, settings in arguments.items():
                if settings["required"]:
                    signature += f" <{param}>"
                else:
                    signature += f" [<{param}>]"
        code = contents
        return [
            Command.from_dict(
                {
                    "code": code,
                    "docstring": docstring,
                    "end_name": end_name,
                    "name": name,
                    "arguments": arguments,
                    "signature": signature,
                }
            )
        ]

    def generate_command_docs(
        self, commands: List[Command], subroutine_types, **kwargs
    ) -> str:
        docs = ""
        for cmd in commands:
            if cmd.docstring is not None:
                docs += (
                    f"{cmd.signature or cmd.name} - {cmd.docstring.format(**kwargs)}\n"
                )
        for subroutine in subroutine_types:
            if subroutine.docstring is not None:
                docs += f"{subroutine.signature or subroutine.name} - {subroutine.docstring.format(**kwargs)}\n"
        return docs
