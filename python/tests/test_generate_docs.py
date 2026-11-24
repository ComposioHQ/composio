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
        ast.parse(parsed["examples"][0]["code"])
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
        {
            "code": 'result = composio.tools.get_raw_tool_router_meta_tools("session_123")\n'
            "print(result)",
            "meta": "",
        }
    ]


@pytest.mark.parametrize(
    ("annotation", "expected"),
    [
        ('t.Optional[t.Literal["a", "b"]]', 'Literal["a", "b"] | None'),
        ('Literal["a", "b"] | None', 'Literal["a", "b"] | None'),
        ("Optional[dict[str, list[int]]]", "dict[str, list[int]] | None"),
        ("dict[str, list[int]] | None", "dict[str, list[int]] | None"),
        ("t.Optional[t.List[str]]", "List[str] | None"),
        ("t.Optional[t.Dict[str, t.Any]]", "Dict[str, Any] | None"),
        (
            "t.Optional[t.List[t.Union[ConfigToolkit, str]]]",
            "List[Union[ConfigToolkit, str]] | None",
        ),
        ("t.List[t.Optional[t.Literal['x']]]", "List[Literal['x'] | None]"),
        ("Optional[Literal[']', '[']]", "Literal[']', '['] | None"),
        ("te.Unpack[SDKConfig]", "SDKConfig"),
    ],
)
def test_format_type_keeps_nested_generics_intact(annotation, expected):
    generate_docs = load_generate_docs_module()

    assert generate_docs.format_type(annotation, max_length=None) == expected


def test_generated_mdx_renders_keyword_only_parameters_with_descriptions():
    generate_docs = load_generate_docs_module()

    rendered_type = generate_docs.format_type(
        "t.Optional[t.Literal['webhook', 'poll']]", max_length=None
    )
    info = {
        "name": "Triggers",
        "access": "composio.triggers",
        "source_link": None,
        "description": "Trigger management.",
        "deprecated": None,
        "properties": [],
        "methods": [
            {
                "name": "create",
                "source_link": None,
                "description": "Create a trigger instance.",
                "parameters": [
                    {
                        "name": "type",
                        "kind": "keyword-only",
                        "type": rendered_type,
                        "optional": True,
                        "description": "",
                    },
                    {
                        "name": "polling_interval",
                        "kind": "keyword-only",
                        "type": "int | None",
                        "optional": True,
                        "description": 'Minutes between polls. Overrides `trigger_config["interval"]`.',
                    },
                ],
                "return_type": "Any",
                "return_description": "",
                "raises": [],
                "examples": [],
            }
        ],
    }

    mdx = generate_docs.generate_class_mdx(info)

    assert (
        "def create(*, type: Literal['webhook', 'poll'] | None = ..., "
        "polling_interval: int | None = ...)" in mdx
    )
    assert "| `type?` | `Literal['webhook', 'poll'] \\| None` |" in mdx
    assert (
        "| `polling_interval?` | `int \\| None` | Minutes between polls. "
        'Overrides `trigger_config["interval"]`. |' in mdx
    )


def test_async_reference_distinguishes_io_from_local_methods():
    griffe = pytest.importorskip("griffe")
    generate_docs = load_generate_docs_module()
    package = griffe.load("composio", search_paths=[str(generate_docs.PACKAGE_DIR)])
    sessions = package["core.models._async_sessions.AsyncToolRouterSession"]
    info = generate_docs.extract_class_info(sessions, "AsyncToolRouterSession", {})
    methods = {method["name"]: method["is_async"] for method in info["methods"]}
    assert methods["execute"]
    assert not methods["local_tools"]


def test_display_signatures_have_reserved_fence_metadata():
    from composio.core.models.mcp import MCP

    generate_docs = load_generate_docs_module()
    griffe = generate_docs.load_griffe()
    module = griffe.load("composio.core.models.mcp")
    info = generate_docs.extract_class_info(module[MCP.__name__], MCP.__name__, {})
    assert "```python signature\ndef " in generate_docs.generate_class_mdx(info)
    decorator = {
        "name": "modifier",
        "description": "",
        "source_link": "",
        "parameters": [],
    }
    assert "```python signature\n@modifier(" in generate_docs.generate_index_mdx(
        [], [decorator]
    )


def test_authored_python_signature_is_rejected():
    generate_docs = load_generate_docs_module()
    with pytest.raises(ValueError, match="signature"):
        generate_docs.normalize_example("```python signature\nprint('example')\n```")


def test_authored_python_opt_out_keeps_its_reason():
    generate_docs = load_generate_docs_module()
    example = generate_docs.normalize_example(
        '```python nocheck="Requires an optional provider"\nuse_provider()\n```'
    )
    assert example == {
        "code": "use_provider()",
        "meta": 'nocheck="Requires an optional provider"',
    }


@pytest.mark.parametrize(
    "name", ["create", "list", "get", "update", "delete", "generate"]
)
def test_mcp_examples_are_python_and_use_the_public_client(name):
    from composio.core.models.mcp import MCP

    generate_docs = load_generate_docs_module()
    examples = generate_docs.parse_docstring(getattr(MCP, name).__doc__)["examples"]
    assert len(examples) == 1
    code = examples[0]["code"]
    ast.parse(code)
    assert f"composio.mcp.{name}(" in code


@pytest.mark.parametrize("mode", ["Async", "Sync"])
def test_quick_start_passes_a_concrete_version_to_execute(mode):
    generate_docs = load_generate_docs_module()
    reference = generate_docs.generate_index_mdx([], [])
    fence = re.search(rf"### {mode} Python\s+```python\n([\s\S]+?)\n```", reference)
    assert fence is not None
    execution = next(
        node
        for node in ast.walk(ast.parse(fence[1]))
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "execute"
    )
    version = next(
        keyword.value for keyword in execution.keywords if keyword.arg == "version"
    )
    assert isinstance(version, ast.Constant)
    assert isinstance(version.value, str)
    assert version.value and version.value != "latest"
