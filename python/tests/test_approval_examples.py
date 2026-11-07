"""Exercise the same approval helpers used by the runnable examples."""

import pytest
from composio.exceptions import ToolInputRequiredError
from examples.approvals import ask_for_approval, run_with_approvals

QUESTION = {
    "type": "elicitation",
    "mode": "form",
    "message": "Allow this read-only call?",
    "requested_schema": {
        "type": "object",
        "properties": {
            "decision": {
                "type": "string",
                "oneOf": [
                    {"const": "approve"},
                    {"const": "always_approve"},
                    {"const": "deny"},
                ],
            }
        },
        "required": ["decision"],
    },
}


@pytest.mark.parametrize(
    "choice", ["approve", "always_approve", "deny", "decline", "cancel"]
)
def test_forwards_the_persons_choice(choice):
    response = ask_for_approval(QUESTION, lambda _: choice)
    assert response == (
        {"action": choice}
        if choice in ("decline", "cancel")
        else {"action": "accept", "content": {"decision": choice}}
    )


def test_invalid_choice_is_not_submitted():
    answers = iter(["yes", "approve"])
    assert ask_for_approval(QUESTION, lambda _: next(answers)) == {
        "action": "accept",
        "content": {"decision": "approve"},
    }
    assert list(answers) == []


@pytest.mark.parametrize("error", [EOFError, KeyboardInterrupt])
def test_closed_terminal_cancels(error):
    def closed(_):
        raise error()

    assert ask_for_approval(QUESTION, closed) == {"action": "cancel"}


def test_all_batch_answers_and_new_continuation_state_are_forwarded():
    calls = []
    answers = iter(
        [
            {"action": "accept", "content": {"decision": "approve"}},
            {"action": "decline"},
            {"action": "cancel"},
        ]
    )

    def execute(**options):
        calls.append(options)
        if len(calls) == 1:
            raise ToolInputRequiredError(
                "Batch",
                input_requests={"first": QUESTION, "second": QUESTION},
                request_state="first-state",
            )
        if len(calls) == 2:
            assert options == {
                "input_responses": {
                    "first": {"action": "accept", "content": {"decision": "approve"}},
                    "second": {"action": "decline"},
                },
                "request_state": "first-state",
            }
            raise ToolInputRequiredError(
                "Batch", input_requests={"next": QUESTION}, request_state="next-state"
            )
        assert options == {
            "input_responses": {"next": {"action": "cancel"}},
            "request_state": "next-state",
        }
        return "done"

    assert run_with_approvals(execute, lambda _: next(answers)) == "done"
    assert len(calls) == 3


def test_waits_for_the_person_before_resuming():
    calls = []

    def execute(**options):
        calls.append(options)
        if not options:
            raise ToolInputRequiredError("Read", input_requests={"id": QUESTION})
        return "cancelled"

    def ask_user(_):
        assert calls == [{}]
        return {"action": "cancel"}

    assert run_with_approvals(execute, ask_user) == "cancelled"
    assert calls[1]["input_responses"] == {"id": {"action": "cancel"}}


def test_execution_failure_is_not_retried():
    calls = []

    def execute(**options):
        calls.append(options)
        raise RuntimeError("network failure")

    with pytest.raises(RuntimeError, match="network failure"):
        run_with_approvals(execute, lambda _: pytest.fail("must not ask"))
    assert calls == [{}]
