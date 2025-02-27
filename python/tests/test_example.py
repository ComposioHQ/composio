"""
E2E Tests for plugin demos and examples.
"""

import ast
import os
import subprocess
import sys
import typing as t
from pathlib import Path

import pytest


PLUGINS = Path.cwd() / "plugins"
EXAMPLES_PATH = Path.cwd() / "examples"

# Require env vars
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
COMPOSIO_API_KEY = os.environ.get("COMPOSIO_API_KEY")
JULEP_API_KEY = os.environ.get("JULEP_API_KEY")
JULEP_API_URL = os.environ.get("JULEP_API_URL")
PDL_API_KEY = os.environ.get("PDL_API_KEY")

# Plugin test definitions
EXAMPLES = {
    "autogen": {
        "plugin": "autogen",
        "file": PLUGINS / "autogen" / "autogen_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
        },
    },
    "llamaindex": {
        "plugin": "llamaindex",
        "file": PLUGINS / "llamaindex" / "llamaindex_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
        },
    },
    "local_tools": {
        "plugin": "autogen",
        "file": EXAMPLES_PATH / "miscellaneous" / "math_agent" / "autogen_math.py",
        "match": {
            "type": "stdout",
            "values": ["11962"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY},
    },
    "runtime_tools": {
        "plugin": "langchain",
        "file": EXAMPLES_PATH / "miscellaneous" / "runtime_tools" / "langchain_math.py",
        "match": {
            "type": "stdout",
            "values": ["2645406630"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY},
    },
    "crew_ai": {
        "plugin": "crew_ai",
        "file": PLUGINS / "crew_ai" / "crewai_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
        },
    },
    # TOFIX(@kaave): httpcore.UnsupportedProtocol: Request URL is missing an 'http://' or 'https://' protocol.
    # "julep": {
    #     "plugin": "julep",
    #     "file": PLUGINS / "julep" / "julep_demo.py",
    #     "match": {
    #         "type": "stdout",
    #         "values": ["finish_reason=<ChatResponseFinishReason.STOP: 'stop'>"],
    #     },
    #     "env": {
    #         "OPENAI_API_KEY": OPENAI_API_KEY,
    #         "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
    #         "JULEP_API_KEY": JULEP_API_KEY,
    #         "JULEP_API_URL": JULEP_API_URL,
    #     },
    # },
    "langchain": {
        "plugin": "langchain",
        "file": PLUGINS / "langchain" / "langchain_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    "langgraph": {
        "plugin": "langgraph",
        "file": PLUGINS / "langgraph" / "langgraph_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    "openai": {
        "plugin": "openai",
        "file": PLUGINS / "openai" / "openai_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    "lyzr": {
        "plugin": "lyzr",
        "file": PLUGINS / "lyzr" / "lyzr_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    "upload_file": {
        "plugin": "openai",
        "file": EXAMPLES_PATH / "miscellaneous" / "attachment" / "send_attachment.py",
        "match": {
            "type": "stdout",
            "values": ["'labelIds': ['SENT']"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    # TOFIX: Agent plots the chart but skips the download step
    # "download_file": {
    #     "plugin": "crew_ai",
    #     "file": EXAMPLES_PATH
    #     / "quickstarters"
    #     / "sql_agent"
    #     / "sql_agent_plotter_crewai"
    #     / "run_issue.py",
    #     "match": {
    #         "type": "stdout",
    #         "values": ["composio_output/CODEINTERPRETER_GET_FILE_CMD_default_"],
    #     },
    #     "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    # },
    "multi_entity_api_key": {
        "plugin": "langchain",
        "file": EXAMPLES_PATH / "miscellaneous" / "multi_entity.py",
        "match": {
            "type": "stdout",
            "values": ["san francisco"],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
            "PDL_API_KEY": PDL_API_KEY,
        },
    },
    # "praisonai": {
    #     "plugin": "praisonai",
    #     "file": PLUGINS / "praisonai" / "praisonai_demo.py",
    #     "match": {
    #         "type": "stdout",
    #         "values": [
    #             "Action executed successfully"
    #         ],
    #     },
    #     "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    # },
    # TODO(@kaavee): Add Anthropic API key
    # "claude": {
    #     "plugin": "claude",
    #     "file": PLUGINS / "claude" / "claude_demo.py",
    #     "match": {
    #         "type": "stdout",
    #         "values": ["Action executed successfully"],
    #     },
    #     "env": {"COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    # },
    # TODO: Add camel
    "pydantic_ai": {
        "plugin": "pydantic_ai",
        "file": PLUGINS / "pydanticai" / "pydantic_ai_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
}


@pytest.mark.skipif(
    condition=os.environ.get("CI", "false") == "true",
    reason="Testing in CI will lead to too much LLM API usage",
)
@pytest.mark.parametrize("example_name, example", EXAMPLES.items())
def test_example(
    example_name: str, example: dict  # pylint: disable=unused-argument
) -> None:
    """Test an example with given environment."""
    plugin_to_test = os.getenv("PLUGIN_TO_TEST")
    if plugin_to_test is not None and plugin_to_test != example["plugin"]:
        pytest.skip(f"Skipping {example['plugin']}")

    for key, val in example["env"].items():
        assert (
            val is not None
        ), f"Please provide value for `{key}` for testing `{example['file']}`"

    filepath = Path(example["file"])
    original_source = filepath.read_text(encoding="utf-8")
    code = filepath.read_text(encoding="utf-8")

    if plugin_to_test != "lyzr":
        code = add_helicone_headers(code)
        filepath.write_text(code, encoding="utf-8")

    proc = subprocess.Popen(  # pylint: disable=consider-using-with
        args=[sys.executable, str(filepath)],
        # TODO(@angryblade): Sanitize the env before running the process.
        env={**os.environ, **example["env"]},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=filepath.parent,
    )

    # Wait for 2 minutes for example to run
    proc.wait(timeout=180)

    filepath.write_text(original_source, encoding="utf-8")

    # Check if process exited with success
    assert proc.returncode == 0, (
        t.cast(t.IO[bytes], proc.stdout).read()
        + b"\n"
        + b"=" * 64
        + b"\n"
        + t.cast(t.IO[bytes], proc.stderr).read()
    )

    # Validate output
    output = (
        t.cast(
            t.IO[bytes],
            (proc.stdout if example["match"]["type"] == "stdout" else proc.stderr),
        )
        .read()
        .decode(encoding="utf-8")
    )
    for match in example["match"]["values"]:
        assert match in output


# The following will get unparsed to get the nodes to put in the
# OpenAI function calls
OS_IMPORT = "import os"
BASE_URL = "'https://oai.helicone.ai/v1'"
DEFAULT_HEADERS_DICT = """
{
    "Helicone-Auth": f"Bearer {os.environ['HELICONE_API_KEY']}",
    "Helicone-Cache-Enabled": "true",
    "Helicone-User-Id": "GitHub-CI-Example-Tests",
}
"""
OS_IMPORT_STMT = ast.parse(OS_IMPORT).body[0]
BASE_URL_EXPR = ast.parse(BASE_URL, mode="eval").body
DEFAULT_HEADERS_EXPR = ast.parse(DEFAULT_HEADERS_DICT, mode="eval").body


class HeliconeAdder(ast.NodeTransformer):
    def __init__(self) -> None:
        self.has_os_import = False
        self.openai_patched_successfully = False

    def visit_Import(self, node: ast.Import) -> ast.Import:
        self.generic_visit(node)

        # If the module already imports `os`, then set the flag
        # to indicate that it has been imported.
        for alias in node.names:
            if alias.name == "os":
                self.has_os_import = True

        return node

    def visit_Call(self, node: ast.Call) -> ast.Call:
        self.generic_visit(node)

        # If it is a call to the function `OpenAI` or `ChatOpenAI`,
        # then preserve the original arguments, and add two new
        # keyword arguments, `base_url` and `default_headers`.
        if isinstance(node.func, ast.Name) and node.func.id in ("OpenAI", "ChatOpenAI"):
            new_keywords = [
                ast.keyword(arg="base_url", value=BASE_URL_EXPR),
                ast.keyword(arg="default_headers", value=DEFAULT_HEADERS_EXPR),
            ]
            node.keywords.extend(new_keywords)
            self.openai_patched_successfully = True

        return node

    def visit_Dict(self, node: ast.Dict) -> ast.Dict:
        self.generic_visit(node)

        # If the dictionary has a 'config_list' string key, and its
        # value is a list, then add the `base_url` and `default_headers`
        # keys to the dictionary.
        if any(
            isinstance(key, ast.Constant)
            and key.value == "config_list"
            and isinstance(value, ast.List)
            for key, value in zip(node.keys, node.values, strict=True)
        ):
            node.keys.extend(
                [ast.Constant("base_url"), ast.Constant("default_headers")]
            )
            node.values.extend([BASE_URL_EXPR, DEFAULT_HEADERS_EXPR])
            self.openai_patched_successfully = True

        return node


def add_helicone_headers(source: str) -> str:
    tree = ast.parse(source)
    helicone_adder = HeliconeAdder()
    tree = helicone_adder.visit(tree)
    assert helicone_adder.openai_patched_successfully

    # If the module does not import `os`, then add the import statement
    if not helicone_adder.has_os_import:
        tree.body.insert(0, OS_IMPORT_STMT)

    return ast.unparse(tree)
