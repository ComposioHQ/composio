import os
import sys
import pytest

from composio.exceptions import ApiKeyNotProvidedError


def run_langchain_script():
    from plugins.langchain.langchain_demo import main

    main()


@pytest.fixture(scope="session", autouse=True)
def pytest_sessionstart_langchain():
    from composio.cli import composio as composio_cli

    """
    Called after the Session object has been created and
    before performing collection and entering the run test loop.
    """
    original_argv = sys.argv  # Backup the original arguments
    sys.argv = [
        "composio",
        "logout",
    ]
    try:
        # INSERT_YOUR_CODE
        if "COMPOSIO_API_KEY" in os.environ:
            os.environ.pop("COMPOSIO_API_KEY", None)
        composio_cli()
    except SystemExit as e:
        print(f"SystemExit ignored: {e}")
    except Exception as e:
        print(f"Error ignored: {e}")
    finally:
        sys.argv = original_argv  # Restore original arguments


def test_langchain_script_not_authorized_error():
    with pytest.raises(ApiKeyNotProvidedError) as exc_info:
        run_langchain_script()
    assert "API Key not provided" in str(exc_info.value)


def test_langchain_script_is_working():
    import os

    os.environ["COMPOSIO_API_KEY"] = "kwrjjvgedmuw5jt1fet2"
    run_langchain_script()
