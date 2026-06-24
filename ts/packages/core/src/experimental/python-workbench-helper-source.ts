export const PYTHON_WORKBENCH_HELPER_SOURCE = `import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


DEFAULT_INVOKE_LLM_MODEL = __COMPOSIO_INVOKE_LLM_MODEL__
RATE_LIMIT_PATTERNS = (
    "rate limit",
    "ratelimit",
    "too many requests",
    "quota exceeded",
    "resource exhausted",
)


def _read_env(name, default=None):
    value = os.environ.get(name)
    return default if value is None or value == "" else value


def _require_value(value, label):
    if value is None or value == "":
        raise RuntimeError("%s is required" % label)
    return value


def _request_id():
    return str(uuid.uuid4())


def _session_execute_url():
    backend_url = _read_env("BACKEND_URL", "https://backend.composio.dev").rstrip("/")
    session_id = _require_value(
        _read_env("COMPOSIO_TOOLROUTER_SESSION_ID"),
        "COMPOSIO_TOOLROUTER_SESSION_ID",
    )
    encoded_session_id = urllib.parse.quote(session_id, safe="")
    return "%s/api/v3/tool_router/session/%s/execute" % (backend_url, encoded_session_id)


def _post_json(url, headers, payload, timeout=120):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read().decode("utf-8")


def _parse_json(text):
    if not text:
        return {}
    return json.loads(text)


def _safe_json(text):
    try:
        return _parse_json(text)
    except json.JSONDecodeError:
        return {"raw": text}


def _contains_rate_limit_error(payload):
    # Only inspect the API "error" field, not the whole body — otherwise benign
    # tool output mentioning "rate limit"/"quota" triggers spurious retries.
    if not isinstance(payload, dict):
        return False
    error = payload.get("error")
    if not error:
        return False
    text = json.dumps(error, default=str).lower()
    return any(pattern in text for pattern in RATE_LIMIT_PATTERNS)


def _retry_delay(attempt, delay_ms):
    base_delay = max(delay_ms, 0) / 1000.0
    if base_delay == 0:
        return
    # Exponential backoff: double the delay each attempt (parity with Apollo).
    backoff = base_delay * (2 ** attempt)
    jitter = random.uniform(0, min(backoff * 0.2, 0.5))
    time.sleep(backoff + jitter)


def _json_shape(value):
    if isinstance(value, dict):
        return {key: _json_shape(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_shape(value[0])] if value else []
    if value is None:
        return "null"
    return type(value).__name__


def print_json_structure(value):
    print(json.dumps(_json_shape(value), indent=2, sort_keys=True))


def _track_helper_event(*_args, **_kwargs):
    return None


def run_composio_tool(
    tool_slug,
    arguments=None,
    retry_params=None,
    print_schema_for_tool=True,
    *,
    account=None,
):
    if not tool_slug:
        return {}, "tool_slug is required"

    api_key = _require_value(_read_env("COMPOSIO_API_KEY"), "COMPOSIO_API_KEY")
    retry_config = {"max_retries": 3, "delay_ms": 2000}
    if retry_params:
        retry_config.update(retry_params)

    payload = {
        "tool_slug": str(tool_slug).strip().upper(),
        "arguments": arguments or {},
    }
    if account is not None:
        payload["account"] = account

    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "x-request-id": _request_id(),
    }
    max_retries = int(retry_config.get("max_retries", 3))
    delay_ms = int(retry_config.get("delay_ms", 2000))

    for attempt in range(max_retries + 1):
        status, _headers, text = _post_json(_session_execute_url(), headers, payload)

        if status == 429 and attempt < max_retries:
            _retry_delay(attempt, delay_ms)
            continue

        if status >= 400:
            response_data = _safe_json(text)
            return response_data, "Composio tool execution failed with HTTP %s" % status

        try:
            response_data = _parse_json(text)
        except json.JSONDecodeError as error:
            return {"raw": text}, "Failed to parse Composio tool response as JSON: %s" % error

        if _contains_rate_limit_error(response_data) and attempt < max_retries:
            _retry_delay(attempt, delay_ms)
            continue

        # A failed tool call returns HTTP 200 with a top-level "error" field;
        # surface it as the error tuple element so callers don't read it as success.
        if isinstance(response_data, dict) and response_data.get("error"):
            return response_data, str(response_data["error"])

        if print_schema_for_tool:
            print_json_structure(response_data)
        return response_data, ""

    return {}, "Composio tool execution failed after retries"


def _strip_code_fence(content):
    stripped = content.strip()
    code_fence = chr(96) * 3
    if stripped.startswith(code_fence):
        stripped = stripped[3:].strip()
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
        if stripped.endswith(code_fence):
            stripped = stripped[:-3].strip()
    elif stripped.lower().startswith("json\\n"):
        stripped = stripped[5:].strip()
    return stripped.strip()


def invoke_llm(query, reasoning_effort=None):
    if not query:
        return "", "query is required"

    system_prompt = (
        "You are a generic, smart large language model. "
        "When asked to output a JSON, respond only with valid JSON - "
        "no other text / code fences / quotes around the JSON."
    )
    response, error = run_composio_tool(
        "COMPOSIO_SEARCH_GROQ_CHAT",
        {
            "model": DEFAULT_INVOKE_LLM_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query},
            ],
            "temperature": 0.5,
        },
        None,
        False,
    )
    _track_helper_event("invoke_llm", {"reasoning_effort": reasoning_effort})

    if error:
        return "", error

    choices = response.get("data", {}).get("choices", "")
    if not choices:
        return "", "No choices returned from invoke_llm"

    first_choice = choices[0] if isinstance(choices, list) else choices
    content = first_choice.get("message", {}).get("content", "")
    if not content:
        return "", "No content returned from invoke_llm"
    return _strip_code_fence(content), ""


def web_search(query):
    if not query:
        return "", "query is required"

    response, error = run_composio_tool(
        "COMPOSIO_SEARCH_EXA_ANSWER",
        {"content": query},
        None,
        False,
    )
    _track_helper_event("web_search", {})

    if error:
        return "", error
    return response.get("data", {}).get("answer", ""), ""
`;
