"""
Type inference verification tests for the TypeSafe (Jev) provider.

This file verifies that type checkers correctly infer `TypesafeToolSet` when using
the TypeSafe provider with Composio, and that a decision narrows on its `kind`.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_typesafe.py

Requirements:
    - composio (core SDK)
    - composio-typesafe
    - typesafe-sdk
"""

# An unused ignore is an error here, so each `type: ignore` below asserts that mypy
# rejects the line.
# mypy: warn-unused-ignores

from typing import TYPE_CHECKING

from composio import Composio

if TYPE_CHECKING:
    from typing import List

    from composio_typesafe import (
        TypesafeAbstainDecision,
        TypesafeCallDecision,
        TypesafeDecision,
        TypesafePartialDecision,
        TypesafeProvider,
        TypesafeToolQuestions,
        TypesafeToolSet,
    )
    from typing_extensions import assert_type


def test_typesafe_provider_toolkits() -> None:
    """Verify the TypeSafe provider returns TypesafeToolSet for a toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[TypesafeToolQuestions, TypesafeToolSet] = Composio(
            provider=TypesafeProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        assert_type(tools, TypesafeToolSet)


def test_typesafe_provider_slug() -> None:
    """Verify the TypeSafe provider returns TypesafeToolSet for a slug query."""
    if TYPE_CHECKING:
        composio: Composio[TypesafeToolQuestions, TypesafeToolSet] = Composio(
            provider=TypesafeProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_AN_ISSUE")

        assert_type(tools, TypesafeToolSet)


def test_typesafe_provider_tools_list() -> None:
    """Verify the TypeSafe provider returns TypesafeToolSet for a tools list query."""
    if TYPE_CHECKING:
        composio: Composio[TypesafeToolQuestions, TypesafeToolSet] = Composio(
            provider=TypesafeProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_AN_ISSUE", "GITHUB_LIST_REPOSITORY_ISSUES"],
        )

        assert_type(tools, TypesafeToolSet)


def test_typesafe_provider_inferred() -> None:
    """Verify the tool set type is inferred without an explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=TypesafeProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        assert_type(tools, TypesafeToolSet)


def test_typesafe_decision_union() -> None:
    """Verify `decide` and `adecide` return the decision union."""
    if TYPE_CHECKING:
        provider = TypesafeProvider()
        composio = Composio(provider=provider)
        tool_set = composio.tools.get(user_id="test", toolkits=["github"])

        assert_type(provider.decide(tool_set, "open an issue"), TypesafeDecision)

        async def decide_async() -> None:
            decision = await provider.adecide(tool_set, {"request": "open an issue"})
            assert_type(decision, TypesafeDecision)


def test_typesafe_decision_narrows_on_kind() -> None:
    """Verify narrowing on `kind` exposes `missing` only on a partial decision."""
    if TYPE_CHECKING:
        provider = TypesafeProvider()
        decision = provider.decide({"tools": []}, "open an issue")

        if decision["kind"] == "partial":
            assert_type(decision, TypesafePartialDecision)
            assert_type(decision["missing"], List[List[str]])
            assert_type(decision["requires_confirmation"], bool)
        elif decision["kind"] == "call":
            assert_type(decision, TypesafeCallDecision)
            # The fields a call shares with a partial come from one base.
            assert_type(decision["tool"], str)
            assert_type(decision["dropped"], List[List[str]])
            decision["missing"]  # type: ignore[typeddict-item]
        else:
            assert_type(decision, TypesafeAbstainDecision)
            assert_type(decision["candidates"][0]["probability"], float)
            decision["missing"]  # type: ignore[typeddict-item]
