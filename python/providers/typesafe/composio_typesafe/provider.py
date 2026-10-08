"""
TypeSafe (Jev) provider.

Jev is not an LLM and has no tool calling. It takes a state plus typed questions and
returns calibrated probabilities. This provider compiles Composio tools into questions,
asks Jev, and turns the answers into a tool call, a partial call, or an abstention.
"""

from __future__ import annotations

import logging
import os
import typing as t

from composio.core.models._modifiers import Modifier, before_execute
from composio.core.provider import NonAgenticProvider, ToolCallSession
from composio.core.provider.base import BaseProviderConfig
from composio.types import Modifiers, Tool, ToolExecutionResponse

from . import companion
from .compile import compile_tool, compile_tool_set
from .decide import (
    DEFAULT_MODEL,
    Ask,
    AsyncAsk,
    DecideOptions,
    DecideSettings,
    create_ask,
    create_async_ask,
    plan_decision,
    run_plan,
    run_plan_async,
)
from .types import (
    TypesafeAbstainedDecisionError,
    TypesafeBypassInfo,
    TypesafeClientLike,
    TypesafeConfirmationRequiredError,
    TypesafeContextScope,
    TypesafeDecision,
    TypesafeGateContext,
    TypesafeIncompleteDecisionError,
    TypesafeJsonValue,
    TypesafeMissingApiKeyError,
    TypesafeShortlist,
    TypesafeState,
    TypesafeThresholds,
    TypesafeToolQuestions,
    TypesafeToolSet,
    parse_decision,
)

_API_KEY_ENV = "TYPESAFE_API_KEY"
_SDK_LOGGER = "typesafe_sdk"


class TypesafeProvider(
    NonAgenticProvider[TypesafeToolQuestions, TypesafeToolSet],
    name="typesafe",
):
    """
    TypeSafe (Jev) provider for the Composio SDK.

    .. code-block:: python

        provider = TypesafeProvider()
        composio = Composio(provider=provider)

        tool_set = composio.tools.get(user_id="user_123", tools=["GITHUB_CREATE_AN_ISSUE"])
        decision = provider.decide(tool_set, "open a ticket about the login bug")

        if decision["kind"] == "partial":
            provider.execute(
                "user_123",
                decision,
                arguments={"title": "Login bug", "owner": "composio", "repo": "sdk"},
            )
    """

    def __init__(
        self,
        *,
        client: t.Optional[TypesafeClientLike] = None,
        api_key: t.Optional[str] = None,
        model: t.Optional[str] = None,
        thresholds: t.Optional[TypesafeThresholds] = None,
        context_scope: t.Optional[TypesafeContextScope] = None,
        **kwargs: t.Unpack[BaseProviderConfig],
    ) -> None:
        """
        Constructs offline and without an API key. The TypeSafe client is built on the
        first `decide` or `adecide`. Key precedence is `client` > `api_key` >
        `TYPESAFE_API_KEY`.

        :param client: A `TypeSafeClient` or `AsyncTypeSafeClient` to use instead of
            building one. Its logging is the caller's responsibility; a client the
            provider builds never logs request bodies.
        :param api_key: Defaults to `TYPESAFE_API_KEY`. Ignored when `client` is set.
        :param model: Defaults to `jev-latest`.
        :param thresholds: Defaults are routing 0.6, gate 0.3, argument 0.6.
        :param context_scope: `arguments` (default) keeps `context` away from routing
            and the action gate.
        """
        super().__init__(**kwargs)
        self._client = client
        self._api_key = api_key
        self._model = model or DEFAULT_MODEL
        self._settings = DecideSettings(thresholds, context_scope)
        self._built: t.Dict[str, TypesafeClientLike] = {}

    def wrap_tool(self, tool: Tool) -> TypesafeToolQuestions:
        """Compiles a Composio tool into Jev questions. Offline."""
        return compile_tool(tool)

    def wrap_tools(self, tools: t.Sequence[Tool]) -> TypesafeToolSet:
        """Compiles a list of tools into a tool set. Raises on duplicate slugs."""
        return compile_tool_set([self.wrap_tool(tool) for tool in tools])

    def decide(
        self,
        tool_set: TypesafeToolSet,
        state: TypesafeState,
        *,
        arguments: t.Optional[t.Mapping[str, t.Any]] = None,
        thresholds: t.Optional[TypesafeThresholds] = None,
        context_scope: t.Optional[TypesafeContextScope] = None,
        model: t.Optional[str] = None,
        timeout: t.Optional[float] = None,
    ) -> TypesafeDecision:
        """
        Returns exactly one of `call`, `partial`, or `abstain`.

        `confidence` is the score of the least certain judgement the call depends on. It
        is not a calibrated probability that the whole call is correct. `abstain` means
        only that the model judged so: API failures and malformed responses raise typed
        errors.

        :param arguments: Values the caller already knows. They get no question and do
            not affect confidence.
        :param timeout: Seconds, passed to the TypeSafe client for each request.
        """
        options = DecideOptions(thresholds, context_scope, arguments)
        plan = plan_decision(tool_set, state, self._settings, options)
        return run_plan(plan, self._ask(model, timeout))

    async def adecide(
        self,
        tool_set: TypesafeToolSet,
        state: TypesafeState,
        *,
        arguments: t.Optional[t.Mapping[str, t.Any]] = None,
        thresholds: t.Optional[TypesafeThresholds] = None,
        context_scope: t.Optional[TypesafeContextScope] = None,
        model: t.Optional[str] = None,
        timeout: t.Optional[float] = None,
    ) -> TypesafeDecision:
        """`decide` with the asynchronous TypeSafe client. Same decisions, same errors."""
        options = DecideOptions(thresholds, context_scope, arguments)
        plan = plan_decision(tool_set, state, self._settings, options)
        return await run_plan_async(plan, self._async_ask(model, timeout))

    @t.overload
    def execute(
        self,
        user_id: str,
        decision: TypesafeDecision,
        arguments: t.Optional[t.Mapping[str, t.Any]] = None,
        confirm: bool = False,
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse: ...

    @t.overload
    def execute(
        self,
        *,
        session: ToolCallSession,
        decision: TypesafeDecision,
        arguments: t.Optional[t.Mapping[str, t.Any]] = None,
        confirm: bool = False,
    ) -> ToolExecutionResponse: ...

    def execute(
        self,
        user_id: t.Optional[str] = None,
        decision: t.Optional[TypesafeDecision] = None,
        arguments: t.Optional[t.Mapping[str, t.Any]] = None,
        confirm: bool = False,
        modifiers: t.Optional[Modifiers] = None,
        *,
        session: t.Optional[ToolCallSession] = None,
    ) -> ToolExecutionResponse:
        """
        Runs a `call`, or a `partial` completed by caller arguments, through Composio.
        Makes no request to TypeSafe and needs no tool set, so a stored decision can run later.

        :param user_id: User ID for direct tool execution.
        :param session: Tool Router session that produced session tools.
        :param decision: The decision to run.
        :param arguments: Caller arguments. They win over Jev-bound values. A key whose
            value is `None` is a value, not a gap.
        :param confirm: Required to execute a decision on a destructive tool.
        :param modifiers: Modifiers for direct execution. A session takes none.
        :return: Object containing output data from the tool call.
        """
        parsed = parse_decision(decision)
        if parsed["kind"] == "abstain":
            raise TypesafeAbstainedDecisionError()
        target = self.resolve_tool_call_execution_target(
            user_id=user_id, session=session
        )
        if session is not None and modifiers is not None:
            raise ValueError(
                "Direct execution modifiers cannot be used with a Tool Router session"
            )

        # Caller arguments win over Jev-bound values.
        call_arguments = {**parsed["arguments"], **(arguments or {})}
        missing = [
            path
            for path in (parsed["missing"] if parsed["kind"] == "partial" else [])
            if path[0] not in call_arguments
        ]
        if missing:
            raise TypesafeIncompleteDecisionError(missing)

        # The stored `risk` class decides, so clearing `requires_confirmation` alone does
        # not skip confirmation. An edited `risk` cannot be detected here.
        needs_confirmation = (
            parsed["risk"] == "destructive" or parsed["requires_confirmation"]
        )
        if needs_confirmation and confirm is not True:
            raise TypesafeConfirmationRequiredError()

        return self.execute_tool_for_target(
            target=target,
            slug=parsed["tool"],
            arguments=call_arguments,
            modifiers=modifiers,
        )

    def shortlist_tools(
        self,
        tools: t.Sequence[Tool],
        state: TypesafeState,
        *,
        k: int,
        model: t.Optional[str] = None,
        timeout: t.Optional[float] = None,
    ) -> TypesafeShortlist:
        """Ranks raw tools against a state and returns the top `k`, for handoff to another provider."""
        plan = companion.plan_shortlist(tools, state, k)
        return run_plan(plan, self._ask(model, timeout))

    async def ashortlist_tools(
        self,
        tools: t.Sequence[Tool],
        state: TypesafeState,
        *,
        k: int,
        model: t.Optional[str] = None,
        timeout: t.Optional[float] = None,
    ) -> TypesafeShortlist:
        """`shortlist_tools` with the asynchronous TypeSafe client."""
        plan = companion.plan_shortlist(tools, state, k)
        return await run_plan_async(plan, self._async_ask(model, timeout))

    def confidence_gate(
        self,
        *,
        tools: t.Sequence[Tool],
        get_request: t.Callable[[TypesafeGateContext], str],
        get_context: t.Optional[
            t.Callable[[TypesafeGateContext], TypesafeJsonValue]
        ] = None,
        threshold: float = 0.7,
        on_unavailable: t.Literal["block", "allow"] = "block",
        on_bypass: t.Optional[t.Callable[[TypesafeBypassInfo], None]] = None,
        max_vetoes: int = 3,
        redact_arguments: t.Optional[
            t.Callable[[str, t.Dict[str, t.Any]], t.Dict[str, t.Any]]
        ] = None,
        model: t.Optional[str] = None,
        timeout: t.Optional[float] = None,
    ) -> Modifier:
        """
        Builds a `before_execute` modifier for direct execution that vetoes a tool call
        which does not match the user's request. It checks consistency; it is not an
        authorization check. Create one gate per agent run and reuse it across that
        run's retries.

        :param tools: The raw tools the gate may approve. Any other tool is blocked.
        :param get_request: Returns the user-authored request. Never return LLM-written text.
        :param get_context: Returns supporting context for the check.
        :param threshold: Minimum probability that the call matches the request.
        :param on_unavailable: What to do when Jev cannot be reached.
        :param on_bypass: Called for every call allowed through without an answer from Jev.
        :param max_vetoes: After this many vetoes the gate blocks every later call.
        :param redact_arguments: Masks secret-bearing arguments before they are sent to
            TypeSafe. It gets a deep copy and must return a `dict` with the same
            structure as the arguments, with every leaf replaced by a value of the same
            JSON type; anything that deletes, adds, or retypes a value blocks the call.
            The call that runs keeps its original arguments.
        """
        return before_execute(
            companion.confidence_gate(
                ask=self._ask(model, timeout),
                tools=tools,
                get_request=get_request,
                get_context=get_context,
                threshold=threshold,
                on_unavailable=on_unavailable,
                on_bypass=on_bypass,
                max_vetoes=max_vetoes,
                redact_arguments=redact_arguments,
            )
        )

    def _ask(self, model: t.Optional[str], timeout: t.Optional[float]) -> Ask:
        return create_ask(
            lambda: self._get_client("TypeSafeClient"), model or self._model, timeout
        )

    def _async_ask(
        self, model: t.Optional[str], timeout: t.Optional[float]
    ) -> AsyncAsk:
        return create_async_ask(
            lambda: self._get_client("AsyncTypeSafeClient"),
            model or self._model,
            timeout,
        )

    def _get_client(self, class_name: str) -> TypesafeClientLike:
        if self._client is not None:
            return self._client
        if class_name not in self._built:
            api_key = self._api_key or os.environ.get(_API_KEY_ENV, "").strip()
            if not api_key:
                raise TypesafeMissingApiKeyError()
            import typesafe_sdk

            self._built[class_name] = getattr(typesafe_sdk, class_name)(api_key=api_key)
        # The SDK's `debug` level prints request bodies, and the SDK applies
        # `TYPESAFE_LOG_LEVEL` to its process-wide logger when first imported. Inject a
        # `client` to log at another level.
        logging.getLogger(_SDK_LOGGER).setLevel(logging.WARNING)
        return self._built[class_name]
