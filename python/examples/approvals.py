"""Run a read-only tool (or --multi batch), asking for approval in the terminal."""

import argparse
import os
import uuid
from collections.abc import Callable
from typing import TypeVar

from composio import Composio
from composio.core.models.tool_router_session import (
    ToolRouterInputResponse,
    ToolRouterSession,
)
from composio.exceptions import ToolInputRequest, ToolInputRequiredError
from jsonschema import validate

TOOL = "HACKERNEWS_GET_USER"
APPROVAL_TOOLS = [TOOL, "HACKERNEWS_GET_MAX_ITEM_ID"]
ARGUMENTS = {"username": "pg"}
MULTI_ARGUMENTS = {
    "tools": [
        {"tool_slug": TOOL, "arguments": ARGUMENTS},
        {"tool_slug": "HACKERNEWS_GET_MAX_ITEM_ID", "arguments": {}},
    ],
    "sync_response_to_workbench": False,
}
T = TypeVar("T")


def ask_for_approval(
    question: ToolInputRequest, read: Callable[[str], str] = input
) -> ToolRouterInputResponse:
    """Support approval decision forms; a general UI should render the full schema."""
    if question["mode"] != "form":
        raise ValueError("This example supports form elicitation only")
    schema = question["requested_schema"]
    field = schema["properties"]["decision"]
    choices = [choice["const"] for choice in field.get("oneOf", [])] or field.get(
        "enum", []
    )
    if not choices:
        raise ValueError("Approval form has no decision choices")
    print(question["message"])
    while True:
        try:
            answer = read(f"Decision ({'/'.join(choices)}; decline/cancel): ").strip()
        except (EOFError, KeyboardInterrupt):
            return {"action": "cancel"}
        if answer == "decline":
            return {"action": "decline"}
        if answer == "cancel":
            return {"action": "cancel"}
        if answer in choices:
            content: dict[str, object | None] = {"decision": answer}
            validate(content, schema)
            return {"action": "accept", "content": content}
        print("Choose one of the displayed answers.")


def run_with_approvals(
    execute: Callable[..., T],
    ask_user: Callable[[ToolInputRequest], ToolRouterInputResponse],
) -> T:
    answers = {}
    while True:
        try:
            return execute(**answers)
        except ToolInputRequiredError as error:
            # Ask every question before resuming, preserving IDs and opaque state.
            responses = {
                question_id: ask_user(question)
                for question_id, question in error.input_requests.items()
            }
            answers = {
                "input_responses": responses,
                "request_state": error.request_state,
            }


def create_composio() -> Composio:
    api_key = os.environ.get("COMPOSIO_API_KEY")
    if not api_key:
        raise RuntimeError("Set COMPOSIO_API_KEY before running this example")
    return Composio(api_key=api_key)


def create_approval_session(composio: Composio) -> ToolRouterSession:
    return composio.create(
        user_id=f"approvals-example-{uuid.uuid4()}",
        toolkits=["hackernews"],
        tools={
            "hackernews": {"enable": APPROVAL_TOOLS, "require_approval": APPROVAL_TOOLS}
        },
        sandbox={"enable": False},
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--multi", action="store_true", help="Ask about a batch of two tools"
    )
    args = parser.parse_args()
    composio = create_composio()
    session = create_approval_session(composio)
    try:

        def execute(**answers):
            if args.multi:
                return session.execute_meta(
                    "COMPOSIO_MULTI_EXECUTE_TOOL", arguments=MULTI_ARGUMENTS, **answers
                )
            return session.execute(TOOL, arguments=ARGUMENTS, **answers)

        result = run_with_approvals(execute, ask_for_approval)
        print(result.model_dump_json(indent=2))
    finally:
        composio.sessions.delete(session.session_id)


if __name__ == "__main__":
    main()
