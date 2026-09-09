"""Provider-free integration coverage for the OpenAI Agents provider."""

import asyncio
from unittest.mock import MagicMock

import pytest
from agentrunproof import (  # type: ignore[import-not-found]
    DeterministicModel,
    assistant_message,
    function_call,
)
from agents import Agent, RunConfig, Runner
from composio_openai_agents import OpenAIAgentsProvider


@pytest.mark.parametrize("streamed", [False, True], ids=["run", "run-streamed"])
def test_wrapped_tool_runs_through_the_real_runner(streamed: bool) -> None:
    """A wrapped Composio tool should execute exactly once in either Runner mode."""

    async def run_case() -> None:
        invocations: list[tuple[str, dict[str, str]]] = []

        def execute_tool(*, slug: str, arguments: dict[str, str]) -> dict[str, str]:
            invocations.append((slug, arguments))
            return {"city": arguments["city"], "forecast": "clear"}

        tool = MagicMock(
            slug="WEATHER_LOOKUP",
            description="Return a deterministic local forecast.",
            input_parameters={
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"],
            },
        )
        wrapped_tool = OpenAIAgentsProvider().wrap_tool(tool, execute_tool)
        model = DeterministicModel(
            [
                [
                    function_call(
                        "WEATHER_LOOKUP",
                        {"city": "Paris"},
                        call_id=f"call-{streamed}",
                    )
                ],
                [assistant_message("done")],
            ]
        )
        agent = Agent(name="Composio contract", model=model, tools=[wrapped_tool])
        run_config = RunConfig(tracing_disabled=True)

        if streamed:
            streamed_result = Runner.run_streamed(
                agent,
                "Check Paris",
                run_config=run_config,
            )
            async for _ in streamed_result.stream_events():
                pass
            final_output = streamed_result.final_output
        else:
            run_result = await Runner.run(
                agent,
                "Check Paris",
                run_config=run_config,
            )
            final_output = run_result.final_output

        assert final_output == "done"
        assert invocations == [("WEATHER_LOOKUP", {"city": "Paris"})]
        model.assert_complete()

    asyncio.run(run_case())
