"""Regression tests for SDK reference generation."""

from __future__ import annotations

import ast
import importlib.util
import inspect
import re
import typing
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from composio.core.models.connected_accounts import ConnectedAccounts
from composio.core.models.tool_router import ToolRouter
from composio.core.models.triggers import Triggers


def load_generate_docs_module():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "generate-docs.py"
    spec = importlib.util.spec_from_file_location("_generate_docs", script_path)
    assert spec is not None
    assert spec.loader is not None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_triggers_parse_generated_example_is_valid_python():
    generate_docs = load_generate_docs_module()

    parsed = generate_docs.parse_docstring(Triggers.parse.__doc__)
    assert parsed["examples"], "Triggers.parse() must keep its public example"

    try:
        ast.parse(parsed["examples"][0])
    except SyntaxError as exc:
        pytest.fail(
            "Triggers.parse() generated SDK reference example must be "
            f"copy-pasteable Python: {exc}"
        )


def test_parse_docstring_extracts_raises_after_returns():
    generate_docs = load_generate_docs_module()

    parsed = generate_docs.parse_docstring(
        """
        Verify a webhook.

        :param secret: The webhook secret
        :return: VerifyWebhookResult containing version and payload
        :raises WebhookSignatureVerificationError: If the signature verification fails
        :raises WebhookPayloadError: If the payload cannot be parsed
        """
    )

    assert parsed["returns"] == "VerifyWebhookResult containing version and payload"
    assert parsed["raises"] == [
        {
            "exception": "WebhookSignatureVerificationError",
            "description": "If the signature verification fails",
        },
        {
            "exception": "WebhookPayloadError",
            "description": "If the payload cannot be parsed",
        },
    ]


def test_parse_docstring_keeps_raises_continuation_lines():
    generate_docs = load_generate_docs_module()

    parsed = generate_docs.parse_docstring(
        """
        Fetch a tool.

        :raises ToolNotFoundError: when the backend reports the slug as unknown
            (404, or 400 for a malformed slug). Any other client error is
            re-raised unchanged.
        """
    )

    assert parsed["raises"] == [
        {
            "exception": "ToolNotFoundError",
            "description": (
                "when the backend reports the slug as unknown (404, or 400 for a "
                "malformed slug). Any other client error is re-raised unchanged."
            ),
        }
    ]


def test_parse_docstring_normalizes_double_backtick_literals():
    generate_docs = load_generate_docs_module()

    parsed = generate_docs.parse_docstring(
        """
        Parse a webhook. Pass ``body=`` explicitly. Uses ``verify_secret``.

        :return: the normalized payload for ``verify_secret``
        :raises ValidationError: If ``verify_secret`` is empty
        """
    )

    assert "``" not in parsed["description"]
    assert "`verify_secret`" in parsed["description"]
    assert "`verify_secret`" in parsed["returns"]
    assert "`verify_secret`" in parsed["raises"][0]["description"]


def test_parse_docstring_normalizes_rst_roles():
    generate_docs = load_generate_docs_module()

    parsed = generate_docs.parse_docstring(
        """
        Build a ``Modifier`` for the file-upload hook (same scoping pattern as
        :func:`before_execute`). Raises :class:`~composio.exceptions.FileUploadAbortedError`
        on abort; see :meth:`composio.core.models.tools.Tools.execute`.
        """
    )

    description = parsed["description"]
    assert "`Modifier`" in description
    assert ":func:" not in description
    assert "`before_execute`" in description
    assert ":class:" not in description
    assert "`FileUploadAbortedError`" in description
    assert "`composio.core.models.tools.Tools.execute`" in description


def test_generated_mdx_renders_raises_section_without_raw_directives():
    generate_docs = load_generate_docs_module()

    info = {
        "name": "Triggers",
        "access": "composio.triggers",
        "source_link": None,
        "description": "Trigger management.",
        "deprecated": None,
        "properties": [],
        "methods": [
            {
                "name": "verify_webhook",
                "source_link": None,
                "description": "Verify a signed webhook request.",
                "parameters": [],
                "return_type": "VerifyWebhookResult",
                "return_description": "The verified payload",
                "raises": [
                    {
                        "exception": "WebhookSignatureVerificationError",
                        "description": "If the signature verification fails",
                    },
                    {"exception": "WebhookPayloadError", "description": ""},
                ],
                "examples": [],
            }
        ],
    }

    mdx = generate_docs.generate_class_mdx(info)

    # Strip legitimate ```python fences before checking for stray reST markup.
    prose = re.sub(r"```.*?```", "", mdx, flags=re.DOTALL)

    assert ":raises" not in mdx
    assert "``" not in prose
    assert "**Raises**" in mdx
    assert (
        "- `WebhookSignatureVerificationError` — If the signature verification "
        "fails" in mdx
    )
    assert "- `WebhookPayloadError`" in mdx


def test_generated_examples_do_not_keep_nested_markdown_fences():
    generate_docs = load_generate_docs_module()

    parsed = generate_docs.parse_docstring(
        """
        Fetch SDK data.

        Example:
            ```python
            result = composio.tools.get_raw_tool_router_meta_tools("session_123")
            print(result)
            ```
        """
    )

    assert parsed["examples"] == [
        'result = composio.tools.get_raw_tool_router_meta_tools("session_123")\n'
        "print(result)"
    ]


def test_index_example_calls_the_public_session_api():
    generate_docs = load_generate_docs_module()
    mdx = generate_docs.generate_index_mdx([], [])
    snippet = re.search(r"```python\n(.*?)```", mdx, re.DOTALL)
    assert snippet is not None
    tools = Mock(return_value=[])

    def create(**kwargs):
        # Validate the generated call against the real SDK signature, without
        # making a network request.
        inspect.signature(ToolRouter.create).bind(None, **kwargs)
        assert kwargs["user_id"] == "user-123"
        return SimpleNamespace(tools=tools)

    composio = SimpleNamespace(
        sessions=SimpleNamespace(create=Mock(side_effect=create))
    )
    namespace = {"Composio": Mock(return_value=composio)}
    example = snippet.group(1).replace("from composio import Composio\n", "")
    exec(compile(example, "<generated quickstart>", "exec"), namespace)
    composio.sessions.create.assert_called_once()
    tools.assert_called_once()


def test_nested_type_annotations_keep_their_meaning():
    generate_docs = load_generate_docs_module()
    rendered = generate_docs.format_type(
        "t.Optional[t.Union[t.List[str], int]]", max_length=None
    )
    assert (
        eval(rendered, vars(typing))
        == typing.Optional[typing.Union[typing.List[str], int]]
    )
    rendered = generate_docs.format_type("t.Unpack[t.Tuple[str, int]]", max_length=None)
    assert eval(rendered, vars(typing)) == typing.Unpack[typing.Tuple[str, int]]


@pytest.mark.parametrize("method_name", ["create", "use"])
def test_session_method_examples_are_valid_and_call_supported_signatures(method_name):
    generate_docs = load_generate_docs_module()
    module = generate_docs.load_griffe().load(
        "composio.core.models.tool_router",
        search_paths=[str(generate_docs.PACKAGE_DIR)],
    )
    info = generate_docs.extract_class_info(
        module.members["ToolRouter"], "ToolRouter", {"access": "composio.sessions"}
    )
    method = next(item for item in info["methods"] if item["name"] == method_name)
    assert method["examples"]
    calls = [
        node
        for example in method["examples"]
        for node in ast.walk(ast.parse(example))
        if isinstance(node, ast.Call)
        and ast.unparse(node.func) == f"composio.sessions.{method_name}"
    ]
    assert calls
    for call in calls:
        inspect.signature(getattr(ToolRouter, method_name)).bind(
            None,
            *[None for _ in call.args],
            **{keyword.arg: None for keyword in call.keywords},
        )


def test_labeled_connection_examples_remain_valid_python():
    generate_docs = load_generate_docs_module()
    parsed = generate_docs.parse_docstring(ConnectedAccounts.link.__doc__)
    assert parsed["examples"]
    calls = []
    for example in parsed["examples"]:
        tree = ast.parse(example)
        calls.extend(
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and ast.unparse(node.func) == "composio.connected_accounts.link"
        )
    assert len(calls) == 3
    assert {"callback_url", "experimental"} <= {
        keyword.arg for call in calls for keyword in call.keywords
    }
    for call in calls:
        inspect.signature(ConnectedAccounts.link).bind(
            None,
            *[None for _ in call.args],
            **{keyword.arg: None for keyword in call.keywords},
        )


def test_sessions_reference_and_mount_are_generated_from_source():
    generate_docs = load_generate_docs_module()
    griffe = generate_docs.load_griffe()
    package = griffe.load("composio", search_paths=[str(generate_docs.PACKAGE_DIR)])
    router = (
        package.members["core"]
        .members["models"]
        .members["tool_router"]
        .members["ToolRouter"]
    )
    info = generate_docs.extract_class_info(
        router, "ToolRouter", {"access": "composio.sessions"}
    )
    mdx = generate_docs.generate_class_mdx(info)
    assert generate_docs.slug_for("ToolRouter") == "sessions"
    assert 'title: "Sessions"' in mdx
    assert "### create()" in mdx
    assert "### use()" in mdx
    assert "| `user_id` | `str` |" in mdx
    assert "| `session_id` | `str` |" in mdx
    assert "composio.tool_router" not in mdx

    composio = package.members["sdk"].members["Composio"]
    info = generate_docs.extract_class_info(composio, "Composio", {"access": None})
    mounts = {prop: cls for cls, prop in generate_docs.EXPECTED_CLASSES.items()}
    mdx = generate_docs.generate_class_mdx(info, mounts)
    assert (
        "| [`sessions`](/reference/sdk-reference/python/sessions) | `Sessions` |" in mdx
    )
    session_row = next(
        line for line in mdx.splitlines() if line.startswith("| [`sessions`]")
    )
    assert session_row.endswith("|")
    assert "[`tool_router`]" not in mdx
