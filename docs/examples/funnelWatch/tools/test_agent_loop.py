#!/usr/bin/env python3
"""Demonstrate the tool-router agent loop (app.agent.run_agent) without live keys.

Stubs the OpenAI client and the Composio session so we can script a multi-step run:
the model issues a workbench tool call, the loop executes it via the session and feeds
the result back, then the model returns a final answer. Also checks the offline
fallback. No network, no real sandbox.

Usage:
  uv run python tools/test_agent_loop.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ["GROWTH_PULSE_FORCE_LOCAL"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Isolate durable storage so the run never touches the real DB (deep_answer records interests).
import tempfile  # noqa: E402

from app.config import settings  # noqa: E402

object.__setattr__(settings, "durable_db", Path(tempfile.mkdtemp(prefix="agentloop-")) / "t.db")

from app import agent  # noqa: E402

_passed = 0
_failed = 0


def check(name: str, got, expected) -> None:
    global _passed, _failed
    if got == expected:
        _passed += 1
        print(f"  ✓ {name}")
    else:
        _failed += 1
        print(f"  ✗ {name}\n      got:      {got!r}\n      expected: {expected!r}")


# --- stubs for the OpenAI Responses API ---
class FnCall:
    type = "function_call"

    def __init__(self, name, arguments, call_id):
        self.name, self.arguments, self.call_id = name, arguments, call_id


class Resp:
    def __init__(self, output, output_text=None):
        self.output, self.output_text = output, output_text


class FakeResponses:
    def __init__(self, scripted):
        self._scripted, self._i = scripted, 0

    def create(self, model, tools=None, input=None):
        resp = self._scripted[self._i]
        self._i += 1
        return resp


class FakeClient:
    def __init__(self, scripted):
        self.responses = FakeResponses(scripted)


class FakeSession:
    def tools(self):
        return [{"type": "function", "name": "COMPOSIO_REMOTE_WORKBENCH"}]


def main() -> int:
    executed = []  # records (slug, args) the loop dispatched to the session

    print("AGENT LOOP (search/workbench → final answer):")
    # Step 1: model calls the workbench. Step 2: model returns its final prose.
    scripted = [
        Resp(output=[FnCall("COMPOSIO_REMOTE_WORKBENCH", '{"code": "print(68)"}', "call_1")]),
        Resp(output=[], output_text="New MRR today is $68."),
    ]
    agent.get_openai = lambda: FakeClient(scripted)
    agent.sandbox.session = lambda: FakeSession()

    def fake_execute(slug, args):
        executed.append((slug, args))
        return {"ok": True, "data": {"stdout": "68"}, "stdout": "68", "error": None}

    agent.sandbox.execute = fake_execute

    reply = agent.run_agent("What is new MRR today?", {"daily_metrics": {"new_mrr": 68}})
    check("loop returns the model's final answer", reply, "New MRR today is $68.")
    check("loop dispatched the workbench tool call", executed, [("COMPOSIO_REMOTE_WORKBENCH", {"code": "print(68)"})])

    print("STEP BUDGET (never-ending tool calls → give up, no hang):")
    loop_forever = [Resp(output=[FnCall("COMPOSIO_REMOTE_WORKBENCH", "{}", f"c{i}")]) for i in range(50)]
    agent.get_openai = lambda: FakeClient(loop_forever)
    check("exhausted budget returns None", agent.run_agent("loop?", {}), None)

    print("FALLBACK (no sandbox/LLM → rule-based answer):")
    agent.get_openai = lambda: None
    agent.sandbox.session = lambda: None
    out = agent.deep_answer(None, "what is mrr today?", {"daily_metrics": {"new_mrr": 68, "net_new_mrr": 68}})
    check("deep_answer falls back to prose", out.startswith("New MRR today is"), True)

    print(f"\n{_passed} passed, {_failed} failed")
    return 1 if _failed else 0


if __name__ == "__main__":
    sys.exit(main())
