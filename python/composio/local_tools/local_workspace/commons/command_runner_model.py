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
