"""Test workspace abstractions."""

from typing import Dict
from unittest import mock

import pytest

from composio.client.enums._action import Action
from composio.exceptions import ComposioSDKError
from composio.tools.env.base import (
    SessionFactory,
    Sessionable,
    Workspace,
    WorkspaceConfigType,
)
from composio.tools.env.id import generate_id


def test_workspace() -> None:
    class TestWorkspace(Workspace):
        def setup(self) -> None:
            pass

        def execute_action(
            self,
            action: Action,
            request_data: dict,
            metadata: dict,
        ) -> Dict:
            return {}

        def teardown(self) -> None:
            pass

    # Test env var parsing
    with mock.patch("os.environ.get", return_value=None), pytest.raises(
        ComposioSDKError,
        match="Please provide value for `COMPOSIO_API_KEY`",
    ):
        _ = TestWorkspace(config=WorkspaceConfigType())


def test_sessionable() -> None:
    class SomeSessionable(Sessionable):
        def __init__(self) -> None:
            super().__init__()
            self._id = generate_id()

        def setup(self) -> None:
            pass

        def teardown(self) -> None:
            pass

    class SomeFactory(SessionFactory[SomeSessionable]):
        pass

    factory = SomeFactory(factory=SomeSessionable)
    session = factory.new()

    assert isinstance(session, SomeSessionable)
    assert factory.recent.id == session.id

    with pytest.raises(
        ComposioSDKError,
        match="No session of type SomeSessionable found with ID: id",
    ):
        assert factory.get(id="id")
