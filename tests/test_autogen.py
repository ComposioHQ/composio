import sys
import unittest.mock as mock

import pytest

from composio.composio_cli import main as composio_cli
from composio.sdk.exceptions import UserNotAuthenticatedException
from composio.sdk.sdk import ConnectedAccount


def run_autogen_script():
    from examples.autogen_demo import composio_tools  # noqa: F401


@pytest.fixture(scope="session", autouse=True)
def pytest_sessionstart_autogen():
    """
    Called after the Session object has been created and
    before performing collection and entering the run test loop.
    """
    original_argv = sys.argv  # Backup the original arguments
    sys.argv = [
        "composio_cli",
        "logout",
    ]
    try:
        composio_cli()
    except SystemExit as e:
        print(f"SystemExit ignored: {e}")
    except Exception as e:
        print(f"Error ignored: {e}")
    finally:
        sys.argv = original_argv  # Restore original arguments


@pytest.mark.skip
def test_autogen_script_not_authorized_error():
    with pytest.raises(UserNotAuthenticatedException) as exc_info:
        run_autogen_script()
    assert (
        "User not authenticated. Please authenticate using composio-cli login"
        in str(exc_info.value)
    )


@pytest.mark.skip
def test_add_github():
    original_argv = sys.argv  # Backup the original arguments
    sys.argv = [
        "composio_cli",
        "add",
        "github",
    ]  # Set argv to simulate command line input
    with mock.patch("webbrowser.open"), mock.patch(
        "composio.sdk.core.ComposioCore.verify_cli_auth_session",
        return_value={"apiKey": "vm2gw01hx7eheano742tb"},
    ), mock.patch("builtins.input", side_effect=["yes", "yes"]), mock.patch(
        "composio.sdk.sdk.Composio.get_connected_account",
        return_value=ConnectedAccount(
            sdk_instance=mock.Mock(),
            clientUniqueUserId="default",
            status="ACTIVE",
            integrationId="integ123",
            connectionParams={"scope": "read", "base_url": "https://api.example.com"},
            appUniqueId="app456",
            id="<random_connected_account_id>",
            createdAt="2021-01-01T00:00:00Z",
            updatedAt="2021-01-02T00:00:00Z",
        ),
    ):
        try:
            composio_cli()
        finally:
            sys.argv = original_argv  # Restore original arguments


@pytest.mark.skip
def test_autogen_script_is_working():
    from plugins.autogen.composio_autogen import client

    client.login("vm2gw01hx7eheano742tb")
    run_autogen_script()
