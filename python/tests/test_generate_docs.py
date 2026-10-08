"""Regression tests for SDK reference generation."""

from __future__ import annotations

import ast
import importlib.util
import re
from pathlib import Path

import pytest

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
