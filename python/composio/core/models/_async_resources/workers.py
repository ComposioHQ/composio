"""Keep blocking file transfers independent of framework callback threads."""

import asyncio
import contextvars
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import ParamSpec, TypeVar

_P = ParamSpec("_P")
_T = TypeVar("_T")

# Threads start on demand. A cancelled transfer already running on a worker
# occupies its slot until its bounded request or filesystem operation finishes.
_file_workers = ThreadPoolExecutor(max_workers=4, thread_name_prefix="composio-files")


async def run_file_io(
    fn: Callable[_P, _T], /, *args: _P.args, **kwargs: _P.kwargs
) -> _T:
    call = partial(contextvars.copy_context().run, fn, *args, **kwargs)
    return await asyncio.get_running_loop().run_in_executor(_file_workers, call)
