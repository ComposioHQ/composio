"""Exercise installed SDK and provider wheels without a checkout or API credentials."""

import asyncio
import json
import sys
from importlib.metadata import distribution
from pathlib import Path

import composio
import httpx
from composio import Composio, exceptions
from composio_client import NotFoundError
from composio_openai import OpenAIProvider

SESSION = "/api/v3.1/tool_router/session"
SLUG = "CHECK_HEALTH"


def respond(request):
    path = request.url.path
    if request.method == "POST" and path == SESSION:
        assert json.loads(request.content)["user_id"] == "test-user"
        return httpx.Response(
            201,
            json={
                "session_id": "sess_test",
                "config_version": 1,
                "mcp": {"type": "http", "url": "https://sdk.invalid/mcp/test"},
                "config": {
                    "user_id": "test-user",
                    "execute": {},
                    "search": {},
                    "preload": {"tools": []},
                },
                "tool_router_tools": [SLUG],
            },
        )
    if request.method == "GET" and path == f"{SESSION}/sess_test/tools":
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "slug": SLUG,
                        "name": "Health check",
                        "description": "Check health",
                        "input_parameters": {"type": "object", "properties": {}},
                        "output_parameters": {},
                        "toolkit": {"slug": "check", "name": "Check"},
                        "tags": [],
                        "scopes": [],
                        "version": "1",
                        "available_versions": ["1"],
                        "no_auth": True,
                        "is_deprecated": False,
                        "deprecated": {
                            "available_versions": [],
                            "displayName": "Check",
                            "is_deprecated": False,
                            "toolkit": {"logo": ""},
                        },
                    }
                ],
                "next_cursor": None,
                "total_items": 1,
                "total_pages": 1,
                "current_page": 1,
            },
        )
    if request.method == "POST" and path == f"{SESSION}/sess_test/execute":
        assert json.loads(request.content)["tool_slug"] == SLUG
        return httpx.Response(
            200,
            json={
                "result_type": "completed",
                "data": {"ok": True},
                "log_id": "log_test",
                "error": None,
            },
        )
    if request.method == "GET" and path == f"{SESSION}/missing":
        return httpx.Response(404, json={"error": {"message": "Unknown session"}})
    raise AssertionError(f"Unexpected {request.method} {path}")


def verify_tools(tools):
    assert [tool["function"]["name"] for tool in tools] == [SLUG]


def verify_result(result):
    assert result.result_type == "completed" and result.data == {"ok": True}


async def main():
    package = Path(distribution("composio").locate_file("composio/__init__.py")).resolve()
    assert Path(composio.__file__).resolve() == package
    assert package.is_relative_to(Path(sys.prefix).resolve())
    options = dict(
        api_key="test",
        provider=OpenAIProvider(),
        allow_tracking=False,
        base_url="https://sdk.invalid",
    )
    transport = httpx.MockTransport(respond)
    try:
        if sys.argv[1] == "sync":
            with httpx.Client(transport=transport) as http:
                client = Composio(**options, http_client=http)
                session = client.create(user_id="test-user")
                verify_tools(session.tools())
                verify_result(session.execute(tool_slug=SLUG))
                client.use("missing")
        elif sys.argv[1] == "async":
            from composio import AsyncComposio

            async with AsyncComposio(
                **options, http_client=httpx.AsyncClient(transport=transport)
            ) as client:
                session = await client.create(user_id="test-user")
                verify_tools(await session.tools())
                verify_result(await session.execute(tool_slug=SLUG))
                from openai.types.chat.chat_completion_message_function_tool_call import (
                    ChatCompletionMessageFunctionToolCall,
                )

                call = ChatCompletionMessageFunctionToolCall.model_validate(
                    {
                        "type": "function",
                        "id": "call_test",
                        "function": {"name": SLUG, "arguments": "{}"},
                    }
                )
                result = await client.provider.aexecute_tool_call(
                    session=session, tool_call=call
                )
                assert result["successful"] and result["data"] == {"ok": True}
                await client.use("missing")
        else:
            raise ValueError("expected sync or async")
    except NotFoundError as exc:
        if sys.argv[1] == "async":
            assert client.client.is_closed()
        assert isinstance(exc, exceptions.ComposioError)
    else:
        raise AssertionError("A missing session must raise the generated status error")


if __name__ == "__main__":
    asyncio.run(main())
