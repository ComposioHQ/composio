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


def test_session_shapes_follow_nested_aliases_and_union_branches():
    generate_docs = load_generate_docs_module()
    reference = generate_docs.load_session_options_module()
    shapes = reference.Shapes(
        {
            "sdk": """
from client import Policy
class Input:
    tools: dict[str, Policy] | None
""",
            "client": """
from typing import TypeAlias
from typing_extensions import TypedDict, Required, NotRequired
class Enabled(TypedDict, total=False):
    enable: Required[list[str]]
    price: NotRequired[bool | None]
class Disabled(TypedDict):
    disable: list[str]
Policy: TypeAlias = Enabled | Disabled
""",
        }
    )
    field = shapes.fields("sdk", shapes.definitions["sdk", "Input"])[0]
    rendered = shapes.type("sdk", field[1])
    assert "[`Policy`](#client-policy)" in rendered
    union = shapes.type("client", shapes.definitions["client", "Policy"])
    assert "[`Enabled`](#client-enabled)" in union
    assert "[`Disabled`](#client-disabled)" in union
    fields = shapes.fields("client", shapes.definitions["client", "Enabled"])
    assert [(field[0], field[2]) for field in fields] == [
        ("enable", True),
        ("price", False),
    ]
    assert ast.unparse(fields[1][1]) == "bool | None"


def test_session_options_nested_links_resolve_to_generated_sections():
    generate_docs = load_generate_docs_module()
    reference = generate_docs.load_session_options_module()
    pages, contract_links = reference.generate_session_options(
        generate_docs.PACKAGE_DIR,
        generate_docs.parse_docstring,
        generate_docs.normalize_inline_rst,
    )
    for slug, links in contract_links.items():
        mdx = pages[slug]
        anchors = set(re.findall(r'<a id="([^"]+)"></a>', mdx))
        targets = set(re.findall(r"\]\(#([^)]+)\)", mdx))
        assert targets <= anchors
        assert {url.split("#", 1)[1] for url in links.values()} <= anchors
        assert all(f"/{slug}#" in url for url in links.values())
    create = contract_links["session-create-options"]
    update = contract_links["session-update-options"]
    returned = contract_links["session-config"]
    assert "ToolRouterInstantConfig" in create and "ToolRouterInstantConfig" in update
    assert "ToolRouterSessionConfig" not in create
    assert "ToolRouterSessionConfig" not in update
    assert "ToolRouterSessionConfig" in returned
    assert "session_patch_params.Toolkits" in update
    assert "session_create_response.ConfigToolsTagsTags" in returned
    assert "session_create_response.ConfigToolkitsEnabled" in returned
    assert "session_create_response.ConfigToolkitsDisabled" in returned
    assert "session_create_response.ConfigToolkitsRequireApproval" in returned


def test_session_config_annotations_link_without_truncating_unions():
    generate_docs = load_generate_docs_module()
    link = "/reference/sdk-reference/python/session-update-options#example"
    rendered = generate_docs.linked_type(
        "Union[Optional[session_patch_params.Toolkits], ToolRouterInstantConfig, 'Omit']",
        {"session_patch_params.Toolkits": link, "ToolRouterInstantConfig": link},
    )
    assert rendered.count(f"]({link})") == 2
    assert "'Omit'" in rendered
    assert "..." not in rendered


def test_sessions_examples_are_python_and_do_not_swallow_method_headings():
    generate_docs = load_generate_docs_module()
    source = generate_docs.PACKAGE_DIR / "composio/core/models/tool_router.py"
    tree = ast.parse(source.read_text())
    router = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "ToolRouter"
    )
    methods = {}
    for node in router.body:
        if isinstance(node, ast.FunctionDef) and node.name in {"create", "use"}:
            examples = generate_docs.session_method_examples(ast.get_docstring(node))
            if not examples:
                continue  # Type-only overloads have no docstring.
            for example in examples:
                assert "```" not in example
                ast.parse(example)
            methods[node.name] = {
                "name": node.name,
                "description": "",
                "parameters": [],
                "return_type": "Any",
                "return_description": "",
                "raises": [],
                "examples": examples,
            }
    assert set(methods) == {"create", "use"}
    mdx = generate_docs.generate_class_mdx(
        {
            "name": "ToolRouter",
            "description": "",
            "properties": [],
            "methods": list(methods.values()),
        }
    )
    in_fence = False
    for line in mdx.splitlines():
        if line.startswith("```"):
            in_fence = not in_fence
        if line == "### use()":
            assert not in_fence
    assert not in_fence


@pytest.mark.parametrize(
    ("annotation", "expected"),
    [
        (
            "t.Optional[t.Union[t.List[str], ToolRouterToolkitsEnableConfig]]",
            "Optional[Union[List[str], ToolRouterToolkitsEnableConfig]]",
        ),
        (
            "t.Optional[t.Union[t.Literal[False], ToolRouterInstantConfig]]",
            "Optional[Union[Literal[False], ToolRouterInstantConfig]]",
        ),
        ("t.Optional[t.Dict[str, str]]", "Optional[Dict[str, str]]"),
        ("te.Unpack[SDKConfig]", "Unpack[SDKConfig]"),
    ],
)
def test_sessions_annotations_preserve_wrapper_nesting(annotation, expected):
    generate_docs = load_generate_docs_module()
    rendered = generate_docs.format_session_type(annotation)
    assert ast.dump(ast.parse(rendered, mode="eval")) == ast.dump(
        ast.parse(expected, mode="eval")
    )
