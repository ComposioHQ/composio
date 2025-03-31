"""Test abstractions"""

import re
from typing import Dict

import pytest
from pydantic import BaseModel, Field

from composio.tools.base.abs import (
    DEPRECATED_MARKER,
    Action,
    InvalidClassDefinition,
    Tool,
    ToolBuilder,
    action_registry,
    remove_json_ref,
    replace_titles,
    tool_registry,
)


# pylint: disable=unused-variable,abstract-method,unused-argument


class TestActionBuilder:
    def test_missing_arguments(self) -> None:
        with pytest.raises(
            InvalidClassDefinition,
            match=re.escape(
                "Invalid action class definition, please define your class "
                "using request and response type generics; class "
                "SomeAction(Action[RequestModel, ResponseModel])"
            ),
        ):

            class SomeAction(Action):
                def execute(self, request: dict, metadata: Dict) -> dict:
                    return {}

    def test_missing_method(self) -> None:
        with pytest.raises(
            InvalidClassDefinition,
            match=re.escape("Please implement SomeAction.execute"),
        ):

            class SomeAction(Action):
                pass

    def test_metadata(self) -> None:
        class Request(BaseModel):
            pass

        class Response(BaseModel):
            pass

        class SomeAction(Action[Request, Response]):
            def execute(self, request: Request, metadata: Dict) -> Response:
                return Response()

        assert SomeAction.name == "some_action"
        assert SomeAction.enum == "SOME_ACTION"
        assert SomeAction.display_name == "Some action"
        assert SomeAction.description == "Some action"
        assert str(SomeAction.file) == __file__

    def test_deprecated_marker(self) -> None:

        class Request(BaseModel):
            pass

        class Response(BaseModel):
            pass

        class SomeAction(Action[Request, Response]):
            """Some action <<DEPRECATED use some_other_action>>"""

            def execute(self, request: Request, metadata: Dict) -> Response:
                return Response()

        assert (
            SomeAction.description == "Some action <<DEPRECATED use some_other_action>>"
        )
        assert DEPRECATED_MARKER in SomeAction.description


class TestToolBuilder:

    def test_request_titles(self) -> None:
        class TestClassWithFields(BaseModel):
            baseId: str = Field(..., description="Some random field")
            user_id: str = Field(..., description="Another random field")

        class NestedClass(BaseModel):
            nestedField: str = Field(..., description="A nested field")

        class TestNestedClass(BaseModel):
            nestedObject: NestedClass = Field(..., description="A nested object")

        class TestClassWithNoFields(BaseModel):
            pass

        schema_with_fields = remove_json_ref(TestClassWithFields.model_json_schema())
        schema_with_nested_fields = remove_json_ref(TestNestedClass.model_json_schema())
        empty_schema = remove_json_ref(TestClassWithNoFields.model_json_schema())
        assert (
            replace_titles(schema_with_fields["properties"])["baseId"]["title"]
            == "Base Id"
        )
        assert (
            replace_titles(schema_with_fields["properties"])["user_id"]["title"]
            == "User Id"
        )
        assert (
            replace_titles(schema_with_nested_fields["properties"])["nestedObject"][
                "title"
            ]
            == "Nested Object"
        )
        assert (
            replace_titles(schema_with_nested_fields["properties"])["nestedObject"][
                "properties"
            ]["nestedField"]["title"]
            == "Nested Field"
        )
        assert replace_titles(empty_schema["properties"]) == {}

    def test_missing_methods(self) -> None:
        with pytest.raises(
            InvalidClassDefinition,
            match=re.escape("Please implement SomeTool.actions"),
        ):

            class SomeTool(Tool):
                logo = ""

                def execute(self, request: dict, metadata: Dict) -> dict:  # type: ignore
                    return {}

            ToolBuilder.validate(obj=SomeTool, name="SomeTool", methods=("actions",))  # type: ignore

    def test_invalid_methods(self) -> None:
        with pytest.raises(
            InvalidClassDefinition,
            match=re.escape("Please implement SomeTool.actions as class method"),
        ):

            class SomeTool(Tool):
                logo = ""

                def actions(self) -> list:  # type: ignore
                    return []

            ToolBuilder.validate(obj=SomeTool, name="SomeTool", methods=("actions",))

    def test_metadata(self) -> None:
        class SomeTool(Tool):
            logo = ""

            @classmethod
            def actions(cls) -> list:
                return []

        ToolBuilder.set_metadata(obj=SomeTool)

        assert SomeTool.name == "some_tool"
        assert SomeTool.enum == "SOME_TOOL"
        assert SomeTool.display_name == "Some tool"
        assert SomeTool.description == "Some tool"
        assert str(SomeTool.file) == __file__

    def test_setup_children(self) -> None:
        class Request(BaseModel):
            pass

        class Response(BaseModel):
            pass

        class SomeAction(Action[Request, Response]):
            def execute(self, request: Request, metadata: Dict) -> Response:
                return Response()

        class SomeTool(Tool):
            logo = ""

            @classmethod
            def actions(cls) -> list:
                return [SomeAction]

        ToolBuilder.validate(obj=SomeTool, name="SomeTool", methods=("actions",))
        ToolBuilder.set_metadata(obj=SomeTool)
        ToolBuilder.setup_children(obj=SomeTool, no_auth=True)

        SomeTool.register()

        assert SomeAction.enum == "SOME_TOOL_SOME_ACTION"
        assert SomeAction.no_auth is True
        assert isinstance(tool_registry["local"][SomeTool.enum], SomeTool)
        assert action_registry["local"][SomeAction.enum] is SomeAction

    def test_description_builder(self) -> None:

        class SomeTool(Tool):
            """
            Some Tool

            With description.
            """

            logo = ""

            @classmethod
            def actions(cls) -> list:
                return []

        ToolBuilder.validate(obj=SomeTool, name="SomeTool", methods=("actions",))
        ToolBuilder.set_metadata(obj=SomeTool)
        ToolBuilder.setup_children(obj=SomeTool)

        assert SomeTool.description == "Some Tool With description."
