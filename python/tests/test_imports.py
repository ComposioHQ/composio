"""Test imports to ensure no circular import issues."""

import pytest


def test_basic_import():
    """Test basic import of Composio class."""
    from composio import Composio

    assert Composio is not None


def test_import_all_public_exports():
    """Test importing all public exports from composio package."""
    from composio import (
        Composio,
        ToolkitLatestVersion,
        ToolkitVersion,
        ToolkitVersionParam,
        ToolkitVersions,
        __version__,
        after_execute,
        before_execute,
        schema_modifier,
    )

    assert Composio is not None
    assert after_execute is not None
    assert before_execute is not None
    assert schema_modifier is not None
    assert ToolkitLatestVersion is not None
    assert ToolkitVersion is not None
    assert ToolkitVersionParam is not None
    assert ToolkitVersions is not None
    assert __version__ is not None


def test_import_types():
    """Test importing types from different modules."""
    from composio.types import (
        ExecuteRequestFn,
        Modifiers,
        Tool,
        ToolExecuteParams,
        ToolExecutionResponse,
        ToolkitLatestVersion,
        ToolkitVersion,
        ToolkitVersionParam,
        ToolkitVersions,
        TriggerEvent,
        TTool,
        TToolCollection,
        auth_scheme,
    )

    assert Tool is not None
    assert TTool is not None
    assert TToolCollection is not None
    assert ToolExecuteParams is not None
    assert ToolExecutionResponse is not None
    assert ExecuteRequestFn is not None
    assert TriggerEvent is not None
    assert Modifiers is not None
    assert auth_scheme is not None
    assert ToolkitLatestVersion is not None
    assert ToolkitVersion is not None
    assert ToolkitVersions is not None
    assert ToolkitVersionParam is not None


def test_import_core_types():
    """Test importing core types directly."""
    from composio.core.types import (
        ToolkitLatestVersion,
        ToolkitVersion,
        ToolkitVersionParam,
        ToolkitVersions,
    )

    assert ToolkitLatestVersion is not None
    assert ToolkitVersion is not None
    assert ToolkitVersions is not None
    assert ToolkitVersionParam is not None


def test_import_core_models():
    """Test importing core models."""
    from composio.core.models import (
        AuthConfigs,
        ConnectedAccounts,
        Toolkits,
        Tools,
        Triggers,
    )

    assert AuthConfigs is not None
    assert ConnectedAccounts is not None
    assert Toolkits is not None
    assert Tools is not None
    assert Triggers is not None


def test_import_sdk():
    """Test importing SDK directly."""
    from composio.sdk import Composio

    assert Composio is not None


def test_import_exceptions():
    """Test importing exceptions."""
    from composio import exceptions

    assert exceptions is not None
    assert hasattr(exceptions, "ApiKeyNotProvidedError")


def test_circular_import_prevention():
    """Test that circular imports are prevented."""
    # This test passes if no ImportError is raised during import
    try:
        from composio import Composio  # noqa: F401
        from composio.core.models.tools import Tools  # noqa: F401
        from composio.core.types import ToolkitVersion  # noqa: F401
        from composio.types import ToolkitVersionParam  # noqa: F401

        # If we get here, no circular import occurred
        assert True
    except ImportError as e:
        pytest.fail(f"Circular import detected: {e}")
