import os
import sys

import pytest  # pylint: disable=import-error

from composio.cli import composio as composio_cli
from composio.exceptions import ApiKeyNotProvidedError


def run_llamaindex_script():
    from plugins.llamaindex.llamaindex_demo import (  # pylint: disable=import-outside-toplevel
        main,
    )

    main()


@pytest.fixture(scope="session", autouse=True)
def pytest_sessionstart_llamaindex():
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


def test_llamaindex_script_not_authorized_error():
    with pytest.raises(ApiKeyNotProvidedError) as exc_info:
        run_llamaindex_script()
    assert "API Key not provided" in str(exc_info.value)


def test_llamaindex_script_is_working():
    os.environ["COMPOSIO_API_KEY"] = "kwrjjvgedmuw5jt1fet2"
    run_llamaindex_script()
