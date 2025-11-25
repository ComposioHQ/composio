import typing as t

from .agentic import AgenticProvider, AgenticProviderExecuteFn
from .none_agentic import NonAgenticProvider

TProvider = t.TypeVar("TProvider", bound=AgenticProvider | NonAgenticProvider)

__all__ = [
    "TProvider",
    "AgenticProvider",
    "NonAgenticProvider",
    "AgenticProviderExecuteFn",
]
