"""Execution callbacks for providers that accept synchronous or asynchronous tools."""

from __future__ import annotations

import asyncio
import inspect
import typing as t
from collections.abc import Awaitable, Callable
from concurrent.futures import Future
from importlib.metadata import PackageNotFoundError, version

from composio.core.provider.none_agentic import NonAgenticProvider
from composio.exceptions import ValidationError

# These published wrappers predate the capability declaration. Their async
# framework entry points explicitly offload the synchronous callback.
_PUBLISHED_WORKER_PROVIDERS = {
    ("composio_autogen.provider", "AutogenProvider"): "composio-autogen",
    (
        "composio_claude_agent_sdk.provider",
        "ClaudeAgentSDKProvider",
    ): "composio-claude-agent-sdk",
    (
        "composio_openai_agents.provider",
        "OpenAIAgentsProvider",
    ): "composio-openai-agents",
}


def require_async_tool_execution(provider: object) -> None:
    """Check how a framework invokes tools before fetching or returning them.

    Schema-only providers leave execution to the application. Agentic adapters
    can await the callback's aexecute method or invoke its synchronous entry
    point on a framework worker thread.
    """
    cls = type(provider)
    if issubclass(cls, NonAgenticProvider):
        return
    for base in cls.__mro__:
        declaration = vars(base)
        distribution = _PUBLISHED_WORKER_PROVIDERS.get(
            (base.__module__, base.__qualname__)
        )
        if "async_tool_execution" not in declaration and distribution is None:
            continue
        # Subclasses may inherit the capability alongside the wrappers it describes.
        if any(
            inspect.getattr_static(cls, method, None)
            is not inspect.getattr_static(base, method, None)
            for method in ("wrap_tool", "wrap_tools")
        ):
            break
        if "async_tool_execution" in declaration:
            if declaration["async_tool_execution"] in ("native", "worker_thread"):
                return
            break
        if distribution is not None:
            try:
                if version(distribution) == "0.34.0":
                    return
            except PackageNotFoundError:
                pass
        break
    raise ValidationError(
        f"{cls.__name__} does not declare how it executes tools with AsyncComposio. "
        "Upgrade the provider, use an async-capable adapter, or await session.execute() directly. "
        "Custom agentic providers can declare async_tool_execution='native' when they "
        "await execute_tool.aexecute(...), or 'worker_thread' when their framework "
        "calls execute_tool(...) on a worker thread."
    )


P = t.ParamSpec("P")
R = t.TypeVar("R")


class AsyncToolCallback(t.Generic[P, R]):
    """Expose a native async callable and a worker-thread entry point for older providers."""

    def __init__(self, fn: Callable[P, Awaitable[R]]) -> None:
        self._fn = fn
        self._loop = asyncio.get_running_loop()

    async def aexecute(self, *args: P.args, **kwargs: P.kwargs) -> R:
        if asyncio.get_running_loop() is self._loop:
            return await self._fn(*args, **kwargs)
        return await asyncio.wrap_future(self._submit(*args, **kwargs))

    def _submit(self, *args: P.args, **kwargs: P.kwargs) -> Future[R]:
        if not self._loop.is_running():
            raise RuntimeError("The AsyncComposio event loop is no longer running.")

        async def run() -> R:
            return await self._fn(*args, **kwargs)

        coroutine = run()
        try:
            return asyncio.run_coroutine_threadsafe(coroutine, self._loop)
        except RuntimeError:
            # The owning loop can close after is_running() is checked.
            coroutine.close()
            raise

    def __call__(self, *args: P.args, **kwargs: P.kwargs) -> R:
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is not None:
            raise RuntimeError(
                "This provider called a synchronous tool on an event loop. "
                "Use its async execution path, or invoke its sync tool on a worker thread."
            )
        return self._submit(*args, **kwargs).result()
