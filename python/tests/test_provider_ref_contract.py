"""Cross-provider ``$ref`` handling contract.

Every provider under ``python/providers`` must be classified here. A provider
either resolves internal ``$ref``/``$defs`` pointers before translating the
schema for its framework, or forwards the schema whole to a vendor that
resolves references natively. Adding a provider without classifying it fails
the suite, so the taxonomy is a build gate rather than tribal knowledge.

The test reads source text instead of importing the providers: importing all
of them would make every vendor SDK a test dependency of the core package.
Behavioral assertions live next to each provider (for example
``tests/test_google_provider.py``); this test owns completeness.

TypeScript counterpart: ``ts/packages/core/test/providers/refContract.test.ts``.
"""

from __future__ import annotations

import typing as t
from dataclasses import dataclass
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PROVIDERS_DIR = REPO_ROOT / "python" / "providers"

# Helpers that inline internal references before schema translation.
# ``alias_tool_input_schema`` and ``substitute_reserved_python_keywords``
# call ``dereference_json_schema`` internally; ``json_schema_to_model``
# resolves local pointers through ``root_schema`` while building the model.
RESOLVER_HELPERS: t.Final = (
    "dereference_json_schema",
    "alias_tool_input_schema",
    "substitute_reserved_python_keywords",
    "json_schema_to_model",
)


@dataclass(frozen=True)
class Classification:
    """How a provider treats a tool's input schema."""

    treatment: t.Literal["resolves-refs", "passthrough"]
    reason: str
    # Helper the provider relies on; required for ``resolves-refs``.
    via: t.Optional[str] = None


PROVIDER_PACKAGES: t.Final[dict[str, Classification]] = {
    "anthropic": Classification(
        "resolves-refs",
        "aliases property keys, which requires keys behind a ref to be materialized",
        via="alias_tool_input_schema",
    ),
    "autogen": Classification(
        "resolves-refs",
        "builds a Python signature from properties, so refs must be inlined first",
        via="substitute_reserved_python_keywords",
    ),
    "claude_agent_sdk": Classification(
        "resolves-refs",
        "aliases property keys before building the MCP tool schema",
        via="alias_tool_input_schema",
    ),
    "crewai": Classification(
        "resolves-refs",
        "converts to a Pydantic model; the converter resolves local pointers",
        via="json_schema_to_model",
    ),
    "gemini": Classification(
        "resolves-refs",
        "aliases property keys and converts to a Pydantic model",
        via="alias_tool_input_schema",
    ),
    "google": Classification(
        "resolves-refs",
        "rebuilds the root from properties/required; Vertex FunctionDeclaration "
        "has no ref/defs field",
        via="dereference_json_schema",
    ),
    "google_adk": Classification(
        "resolves-refs",
        "builds a Python signature from properties, so refs must be inlined first",
        via="alias_tool_input_schema",
    ),
    "langchain": Classification(
        "resolves-refs",
        "builds a Pydantic args schema from properties",
        via="substitute_reserved_python_keywords",
    ),
    "langgraph": Classification(
        "resolves-refs",
        "builds a Pydantic args schema from properties",
        via="substitute_reserved_python_keywords",
    ),
    "llamaindex": Classification(
        "resolves-refs",
        "builds a Python signature from properties, so refs must be inlined first",
        via="substitute_reserved_python_keywords",
    ),
    "openai": Classification(
        "passthrough",
        "re-exports the core OpenAI providers, which forward the whole schema",
    ),
    "openai_agents": Classification(
        "passthrough",
        "forwards the whole schema; OpenAI resolves $defs/$ref natively",
    ),
}

# Sources outside ``python/providers`` that hand schemas to a vendor.
EXTRA_PASSTHROUGH_SOURCES: t.Final[dict[str, str]] = {
    "python/composio/core/provider/_openai.py": "forwards the whole schema",
    "python/composio/core/provider/_openai_responses.py": "forwards the whole schema",
}


def _discover_providers() -> list[str]:
    return sorted(
        entry.name
        for entry in PROVIDERS_DIR.iterdir()
        if entry.is_dir() and (entry / "pyproject.toml").is_file()
    )


def _provider_source(provider: str) -> str:
    package_dirs = [
        entry
        for entry in (PROVIDERS_DIR / provider).iterdir()
        if entry.is_dir() and entry.name.startswith("composio_")
    ]
    assert package_dirs, f"no composio_* package under providers/{provider}"
    return "\n".join(
        path.read_text(encoding="utf-8")
        for package_dir in package_dirs
        for path in sorted(package_dir.rglob("*.py"))
    )


DISCOVERED: t.Final = _discover_providers()


def test_discovers_provider_packages() -> None:
    # Guards the test itself: a broken path would make everything below
    # vacuously pass.
    assert len(DISCOVERED) >= 12


def test_classifies_every_provider_package() -> None:
    assert [name for name in DISCOVERED if name not in PROVIDER_PACKAGES] == []


def test_does_not_classify_removed_providers() -> None:
    assert [name for name in PROVIDER_PACKAGES if name not in DISCOVERED] == []


@pytest.mark.parametrize(
    "provider",
    [n for n, c in PROVIDER_PACKAGES.items() if c.treatment == "resolves-refs"],
)
def test_resolves_refs_before_translation(provider: str) -> None:
    classification = PROVIDER_PACKAGES[provider]
    assert classification.via in RESOLVER_HELPERS, classification.reason
    assert classification.via in _provider_source(provider), classification.reason


@pytest.mark.parametrize(
    "provider",
    [n for n, c in PROVIDER_PACKAGES.items() if c.treatment == "passthrough"],
)
def test_forwards_schema_whole(provider: str) -> None:
    classification = PROVIDER_PACKAGES[provider]
    assert classification.via is None
    source = _provider_source(provider)
    assert [h for h in RESOLVER_HELPERS if h in source] == [], classification.reason


@pytest.mark.parametrize("relative_path", sorted(EXTRA_PASSTHROUGH_SOURCES))
def test_extra_sources_forward_schema_whole(relative_path: str) -> None:
    path = REPO_ROOT / relative_path
    assert path.is_file(), f"{relative_path} not found; update this test"
    source = path.read_text(encoding="utf-8")
    assert [h for h in RESOLVER_HELPERS if h in source] == []
