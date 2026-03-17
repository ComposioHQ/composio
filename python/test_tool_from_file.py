# ruff: noqa: E402
"""
Test a local action file's schema directly against the OpenAI API.

Usage:
    python test_tool_from_file.py <FILE_PATH> [--provider PROVIDER]

Loads the tool schema from a local action file via Action.from_file(),
then sends it to OpenAI's chat completions API to verify the schema
is accepted and produces a tool call.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

MAX_RETRIES = 3
RETRY_DELAY = 2
MAX_DETAIL_LENGTH = 250

PROVIDER_CHOICES = ["openai", "anthropic", "gemini"]
MERCURY_PATH = Path.home() / "mercury"


def load_schema(file_path: str) -> tuple[dict, str, str]:
    """Load tool schema from a local action file.

    Returns (schema, description, slug).
    """
    from mercury.tools.base import Action

    action = Action.from_file(Path(file_path).resolve())
    schema = action.request.schema()
    description = action.description or f"Execute {action.slug}"
    return schema, description, action.slug


def test_openai(schema: dict, name: str, description: str) -> dict:
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4.1",
            "messages": [
                {
                    "role": "user",
                    "content": f"Call the {name} tool with reasonable defaults.",
                }
            ],
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": name,
                        "description": description,
                        "parameters": schema,
                    },
                }
            ],
        },
    )
    resp.raise_for_status()
    data = resp.json()
    call = data["choices"][0]["message"]["tool_calls"][0]
    return {"args": call["function"]["arguments"]}


def test_anthropic(schema: dict, name: str, description: str) -> dict:
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1024,
            "messages": [
                {
                    "role": "user",
                    "content": f"You MUST call the {name} tool immediately with reasonable default arguments. Do not ask questions.",
                }
            ],
            "tools": [
                {"name": name, "description": description, "input_schema": schema}
            ],
            "tool_choice": {"type": "any"},
        },
    )
    resp.raise_for_status()
    data = resp.json()
    tool_use = next(block for block in data["content"] if block["type"] == "tool_use")
    return {"args": json.dumps(tool_use["input"])}


def test_gemini(schema: dict, name: str, description: str) -> dict:
    api_key = os.environ["GOOGLE_API_KEY"]
    resp = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
        headers={"Content-Type": "application/json"},
        json={
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": f"Call the {name} tool with reasonable defaults."}
                    ],
                }
            ],
            "tools": [
                {
                    "function_declarations": [
                        {
                            "name": name,
                            "description": description,
                            "parameters": schema,
                        }
                    ]
                }
            ],
        },
    )
    resp.raise_for_status()
    data = resp.json()
    for part in data["candidates"][0]["content"]["parts"]:
        if "functionCall" in part:
            return {"args": json.dumps(part["functionCall"]["args"])}
    raise RuntimeError("No function call in response")


PROVIDERS = {
    "openai": ("OpenAI", test_openai),
    "anthropic": ("Anthropic", test_anthropic),
    "gemini": ("Google Gemini", test_gemini),
}


def with_retries(fn, *args) -> dict:
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn(*args)
        except Exception as e:
            last_err = e
            err_str = str(e).lower()
            retryable = any(
                s in err_str
                for s in [
                    "no function call",
                    "no tool call",
                    "connection error",
                    "timeout",
                    "rate limit",
                ]
            )
            if retryable and attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
                continue
            raise
    raise last_err


def run_tests(
    file_path: str, schema: dict, description: str, slug: str, provider: str | None
):
    fn_name = slug.lower()[:64]

    props = list(schema.get("properties", {}).keys())
    print(f"File: {file_path}")
    print(f"Tool: {slug}")
    print(
        f"Schema properties ({len(props)}): {props[:10]}{'...' if len(props) > 10 else ''}"
    )
    print()

    if provider:
        items = [(provider, PROVIDERS[provider])]
    else:
        items = list(PROVIDERS.items())

    results = []
    for _key, (display_name, test_fn) in items:
        try:
            result = with_retries(test_fn, schema, fn_name, description)
            detail = result.get("args") or result.get("output", "")
            if (
                MAX_DETAIL_LENGTH > 0
                and isinstance(detail, str)
                and len(detail) > MAX_DETAIL_LENGTH
            ):
                detail = detail[: MAX_DETAIL_LENGTH - 3] + "..."
            results.append((display_name, "OK", detail))
        except Exception as e:
            error_str = str(e)
            first_line = error_str.split("\n")[0]
            if MAX_DETAIL_LENGTH > 0 and len(first_line) > MAX_DETAIL_LENGTH:
                first_line = first_line[: MAX_DETAIL_LENGTH - 3] + "..."
            results.append((display_name, "FAILED", first_line))

    name_width = max(len(r[0]) for r in results)
    status_width = 6
    print(f"{'Provider':<{name_width}}  {'Status':<{status_width}}  Detail")
    print(f"{'-' * name_width}  {'-' * status_width}  {'-' * 60}")
    for pname, status, detail in results:
        print(f"{pname:<{name_width}}  {status:<{status_width}}  {detail}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Test a local action file's schema against AI provider APIs."
    )
    parser.add_argument(
        "file_path",
        help="Path to the action file (e.g. apps/_21risk/actions/get_compliance.py)",
    )
    parser.add_argument(
        "--provider",
        choices=PROVIDER_CHOICES,
        default=None,
        help="Test a single provider instead of all",
    )
    args = parser.parse_args()

    if not (MERCURY_PATH / args.file_path).exists():
        print(f"File not found: {args.file_path}")
        sys.exit(1)

    required_keys = {
        "openai": ["OPENAI_API_KEY"],
        "anthropic": ["ANTHROPIC_API_KEY"],
        "gemini": ["GOOGLE_API_KEY"],
    }
    if args.provider:
        required = required_keys[args.provider]
    else:
        required = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}")
        sys.exit(1)

    schema, description, slug = load_schema(args.file_path)
    run_tests(args.file_path, schema, description, slug, args.provider)
