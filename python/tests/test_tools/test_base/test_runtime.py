"""Test runtime decorator."""

import re

import pytest
import typing_extensions as te
from pydantic import BaseModel, Field

from composio.tools.base.abs import tool_registry
from composio.tools.base.runtime import InvalidRuntimeAction, action


def test_pydantic_model_action() -> None:
    class MultiplyRequest(BaseModel):
        a: int = Field(..., description="Number a")
        b: int = Field(..., description="Number b")

    class MultiplyResponse(BaseModel):
        result: int = Field(..., description="Result of multiplication")

    @action(toolname="math")
    def multiply_pydantic(
        request: MultiplyRequest,
        metadata: dict,  # pylint: disable=unused-argument
    ) -> MultiplyResponse:
        """Multiply given numbers"""
        return MultiplyResponse(result=request.a * request.b)

    assert multiply_pydantic.display_name == "multiply_pydantic"
    assert multiply_pydantic.description == "Multiply given numbers"


def test_docstring_args() -> None:
    @action(toolname="math")
    def multiply(a: int, b: int, c: int) -> int:
        """
        Multiply three numbers

        :param a: Number a
        :param b: Number b
        :param c: Number c
        :return result: Result of the multiplication
        """
        return a * b * c

    assert multiply.display_name == "multiply"
    assert multiply.description == "Multiply three numbers"

    tool = tool_registry["runtime"][multiply.tool.upper()]
    assert tool.gid == "runtime"

    response = tool.execute(action=multiply.enum, params={"a": 1, "b": 2})
    assert not response["successful"]
    assert "Following fields are missing: {'c'}" in response["error"]

    response = tool.execute(action=multiply.enum, params={"a": 1, "b": 2, "c": 3})
    assert response["successful"]
    assert response["error"] is None
    assert response["data"]["result"] == 6


def test_annotated_args() -> None:
    @action(toolname="math")
    def square(
        number: te.Annotated[int, "Number to calculate square"]
    ) -> te.Annotated[int, "Square of a number"]:
        """Calculate square of a number"""
        return number**2

    assert square.request.schema() == {  # type: ignore
        "properties": {
            "number": {
                "default": None,
                "description": "Number to calculate square",
                "title": "Number",
                "type": "integer",
            }
        },
        "title": "SquareRequest",
        "type": "object",
    }

    assert square.response.schema().get("properties").get("data").get("properties").get("result") == {  # type: ignore
        "default": None,
        "description": "Square of a number",
        "title": "Result",
        "type": "integer",
    }


def test_missing_docstring() -> None:
    with pytest.raises(
        InvalidRuntimeAction,
        match="Runtime action `multiply` is missing docstring",
    ):

        @action(toolname="math")
        def multiply(a: int, b: int, c: int) -> int:
            return a * b * c


def test_missing_argspec() -> None:
    with pytest.raises(
        InvalidRuntimeAction,
        match="Please provide description for `number` on runtime action `square`",
    ):

        @action(toolname="math")
        def square(number: int) -> int:
            """
            Calculate square of a number

            :return result: Square of number
            """
            return number**2


def test_missing_return_type() -> None:
    with pytest.raises(
        InvalidRuntimeAction,
        match="Please add return type on runtime action `square`",
    ):

        @action(toolname="math")
        def square(number: int):
            """
            Calculate square of a number

            :return result: Square of number
            """
            return number**2


def test_tool_namespace() -> None:
    """Test to make sure two runtime actions can be defined using one tool name."""

    @action(toolname="maths")
    def square(
        number: te.Annotated[int, "Number to calculate square"]
    ) -> te.Annotated[int, "Square of a number"]:
        """Calculate square of a number"""
        return number**2

    @action(toolname="maths")
    def inverse(
        number: te.Annotated[float, "Number to inverse"]
    ) -> te.Annotated[float, "Inverse of a number"]:
        """Calculate inverse of a number"""
        return 1 / number

    actions = tool_registry["runtime"]["MATHS"].actions()

    assert len(actions) == 2
    assert square in actions
    assert inverse in actions


def test_untyped_param() -> None:
    """Test if error is raised if a param is missing type annotation."""
    with pytest.raises(
        InvalidRuntimeAction,
        match=re.escape(
            "Following arguments are missing type annotations: {'execute_request'}"
        ),
    ):

        # pylint: disable=unused-argument
        @action(toolname="github")
        def list_prs(owner: str, repo: str, execute_request) -> list[str]:
            """
            List PRs for a repo

            :param owner: Owner
            :param repo: Repository
            :return repositories: Repositories
            """
            return []
