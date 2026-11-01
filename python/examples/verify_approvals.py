"""Unattended CI checks, restricted to the read-only tools from approvals.py."""

import re

from approvals import (
    ARGUMENTS,
    MULTI_ARGUMENTS,
    TOOL,
    create_approval_session,
    create_composio,
    run_with_approvals,
)
from pydantic import BaseModel, TypeAdapter


class ToolResponse(BaseModel):
    successful: bool
    error: str | None = None


class BatchItem(BaseModel):
    error: str | None = None
    response: ToolResponse | None = None


class Batch(BaseModel):
    results: list[BatchItem]
    total_count: int
    success_count: int
    error_count: int


class BatchWrapper(BaseModel):
    data: Batch


def assert_batch(data: dict[str, object], successes: int, failures: int) -> None:
    parsed = TypeAdapter(Batch | BatchWrapper).validate_python(data)
    batch = parsed.data if isinstance(parsed, BatchWrapper) else parsed
    assert batch.total_count == successes + failures
    assert len(batch.results) == successes + failures
    assert batch.success_count == successes
    assert batch.error_count == failures
    denied = 0
    for item in batch.results:
        error = item.error or (item.response.error if item.response else None)
        if error:
            assert re.search(r"approv|deni|declin|cancel|reject", error, re.I)
            denied += 1
        else:
            assert item.response is not None and item.response.successful
    assert denied == failures


def main():
    composio = create_composio()
    cases = [
        ("approve", {"action": "accept", "content": {"decision": "approve"}}, True),
        ("deny", {"action": "accept", "content": {"decision": "deny"}}, False),
        ("decline", {"action": "decline"}, False),
        ("cancel", {"action": "cancel"}, False),
        (
            "always_approve",
            {"action": "accept", "content": {"decision": "always_approve"}},
            True,
        ),
    ]
    for label, answer, allowed in cases:
        session = create_approval_session(composio)
        try:
            prompts = 0

            def ask_user(question):
                nonlocal prompts
                prompts += 1
                assert prompts <= 2, "Approval did not resolve"
                return answer

            result = run_with_approvals(
                lambda **answers: session.execute(TOOL, arguments=ARGUMENTS, **answers),
                ask_user,
            )
            assert prompts > 0, "Execution bypassed approval"
            assert result.result_type == ("completed" if allowed else "failed")
            if allowed:
                assert result.error is None
                assert result.data
            else:
                assert re.search(
                    r"approv|deni|declin|cancel|reject", str(result.error), re.I
                )
            if label == "always_approve":

                def must_not_ask(question):
                    raise AssertionError(
                        "Always approve asked again in the same session"
                    )

                next_result = run_with_approvals(
                    lambda **answers: session.execute(
                        TOOL, arguments={"username": "dang"}, **answers
                    ),
                    must_not_ask,
                )
                assert next_result.result_type == "completed"
                assert next_result.error is None
                assert next_result.data
            print(f"PASS {label}")
        finally:
            composio.sessions.delete(session.session_id)

    session = create_approval_session(composio)
    try:
        prompts = 0

        def ask_batch(question):
            nonlocal prompts
            prompts += 1
            assert prompts <= 2, "Batch approval did not resolve"
            return {
                "action": "accept",
                "content": {"decision": "approve" if prompts == 1 else "deny"},
            }

        result = run_with_approvals(
            lambda **answers: session.execute_meta(
                "COMPOSIO_MULTI_EXECUTE_TOOL", arguments=MULTI_ARGUMENTS, **answers
            ),
            ask_batch,
        )
        assert prompts == 2, "Expected a question for each tool call"
        assert_batch(result.data, 1, 1)
        print("PASS batch with one approval and one denial")
    finally:
        composio.sessions.delete(session.session_id)


if __name__ == "__main__":
    main()
