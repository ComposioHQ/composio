"""Test local tools abstraction."""

from typing import Dict, List

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction, LocalTool


class Request(BaseModel):
    name: str = Field(..., description="Name of the user")


class Response(BaseModel):
    message: str = Field(..., description="Message for the user")


class SomeAction(LocalAction[Request, Response]):
    def execute(self, request: Request, metadata: Dict) -> Response:
        return Response(message=f"Hello, {request}")


class SomeTool(LocalTool, autoload=True):
    logo = ""

    @classmethod
    def actions(cls) -> List[type[LocalAction]]:
        return [SomeAction]


def test_build_local_action() -> None:
    for prop in ("browsers", "filemanagers", "shells"):
        assert hasattr(SomeAction, prop) and isinstance(
            getattr(SomeAction, prop), property
        ), f"Local action abstraction needs `{prop}` property"

    assert SomeTool.gid == "local"


class TestLocalTool:
    def test_request_validation(self) -> None:
        tool = SomeTool()
        response = tool.execute(
            SomeAction.enum,
            params={},
            metadata={
                "_shells": lambda: None,
                "_browsers": lambda: None,
                "_filemanagers": lambda: None,
            },
        )

        assert not response["successful"]
        assert "Following fields are missing: {'name'}" in response["error"]
