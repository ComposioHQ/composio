import typing as t

from .agentic import AgenticProvider, AgenticProviderExecuteFn
from .base import TTool, TToolCollection
from .none_agentic import NonAgenticProvider

TProvider = t.TypeVar(
    "TProvider",
    bound="AgenticProvider[t.Any, t.Any] | NonAgenticProvider[t.Any, t.Any]",
)

__all__ = [
    "TTool",
    "TToolCollection",
    "TProvider",
    "AgenticProvider",
    "NonAgenticProvider",
    "AgenticProviderExecuteFn",
]
