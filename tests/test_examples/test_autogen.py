import sys

import pytest  # pylint: disable=import-error

from composio.cli import composio as composio_cli
from composio.exceptions import ApiKeyNotProvidedError


def run_autogen_script():
    from plugins.autogen.autogen_demo import (  # pylint: disable=import-outside-toplevel
        main,
    )

    main()


@pytest.fixture(scope="session", autouse=True)
def pytest_sessionstart_autogen():
    """
    Called after the Session object has been created and
    before performing collection and entering the run test loop.
    """
    original_argv = sys.argv  # Backup the original arguments
    sys.argv = [
        "composio",
        "logout",
    ]
    print("")
    try:
        composio_cli()
    except SystemExit as e:
        print(f"SystemExit ignored: {e}")
    except Exception as e:
        print(f"Error ignored: {e}")
    finally:
        sys.argv = original_argv  # Restore original arguments


def test_autogen_script_not_authorized_error(monkeypatch):
    monkeypatch.delenv("COMPOSIO_API_KEY", raising=False)
    with pytest.raises(ApiKeyNotProvidedError) as exc_info:
        run_autogen_script()
    assert "API Key not provided" in str(exc_info.value)


def test_autogen_script_is_working():
    run_autogen_script()
