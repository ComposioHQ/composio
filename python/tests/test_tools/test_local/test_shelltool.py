# pylint: disable=protected-access,no-member,unsupported-membership-test,unspecified-encoding,not-an-iterable,unsubscriptable-object,unused-argument
import tempfile
from unittest.mock import patch

import pytest

from composio.tools.env.base import SessionFactory
from composio.tools.env.host.shell import HostShell
from composio.tools.local.shelltool.shell_exec.actions.exec import (
    ExecCommand,
    ShellExecRequest,
)
from composio.tools.local.shelltool.shell_exec.actions.new import (
    CreateShell,
    ShellCreateRequest,
)
from composio.tools.local.shelltool.shell_exec.actions.spawn import (
    SpawnProcess,
    SpawnRequest,
)


@pytest.fixture(scope="module")
def temp_dir():
    with tempfile.TemporaryDirectory() as tmpdirname:
        yield tmpdirname


@pytest.fixture(scope="module")
def shell_factory():
    shell = HostShell()
    session_factory = SessionFactory(lambda: shell)
    session_factory.new()
    return session_factory


@pytest.mark.usefixtures("temp_dir")
class TestShelltool:
    def test_exec_command(self, shell_factory):
        exec_action = ExecCommand()
        exec_action._shells = lambda: shell_factory

        response = exec_action.execute(ShellExecRequest(cmd="echo 'Hello, World!'"), {})
        print("response in test_exec_command", response)

        assert response.stdout.strip() == "Hello, World!"
        assert response.stderr == ""
        assert response.exit_code == 0
        assert "Currently in" in response.current_shell_pwd

    def test_create_shell(self, shell_factory):
        create_action = CreateShell()
        create_action._shells = lambda: shell_factory

        response = create_action.execute(ShellCreateRequest(), {})

        assert response.shell_id != ""

    # @patch("subprocess.Popen")
    # @patch("tempfile.mkdtemp")
    # def test_spawn_process(self, mock_mkdtemp, mock_popen, temp_dir):
    #     mock_process = MagicMock()
    #     mock_process.pid = 12345
    #     mock_popen.return_value = mock_process

    #     # Create a real temporary directory for output files
    #     temp_output_dir = tempfile.mkdtemp(dir=temp_dir)
    #     mock_mkdtemp.return_value = temp_output_dir

    #     spawn_action = SpawnProcess()
    #     response = spawn_action.execute(
    #         SpawnRequest(cmd="python test_script.py", working_dir=temp_dir), {}
    #     )

    #     # Assert that the files exist
    #     assert os.path.exists(response.stdout)
    #     assert os.path.exists(response.stderr)
    #     assert os.path.exists(response.pid)

    #     # Write the mock PID to the PID file
    #     with open(response.pid, 'w') as f:
    #         f.write(str(mock_process.pid))

    #     with open(response.pid, "r") as f:
    #         assert f.read().strip() == "12345"

    #     # Clean up the temporary directory
    #     shutil.rmtree(temp_output_dir)

    def test_exec_command_with_error(self, shell_factory):
        exec_action = ExecCommand()
        exec_action._shells = lambda: shell_factory

        response = exec_action.execute(
            ShellExecRequest(cmd="ls /nonexistent_directory"), {}
        )

        assert "No such file or directory" in response.stderr
        assert response.exit_code != 0

    def test_exec_command_with_environment_variable(self, shell_factory):
        exec_action = ExecCommand()
        exec_action._shells = lambda: shell_factory

        # Set environment variable
        exec_action.execute(
            ShellExecRequest(cmd="export TEST_VAR='Hello from test'"), {}
        )

        # Read environment variable
        response = exec_action.execute(ShellExecRequest(cmd="echo $TEST_VAR"), {})

        assert response.stdout.strip() == "Hello from test"

    def test_exec_command_multiple_commands(self, shell_factory):
        exec_action = ExecCommand()
        exec_action._shells = lambda: shell_factory

        response = exec_action.execute(
            ShellExecRequest(cmd="echo 'First' && echo 'Second' && echo 'Third'"), {}
        )

        assert "First\nSecond\nThird" in response.stdout

    @pytest.mark.parametrize(
        "cmd,expected_output",
        [
            ("python --version", "Python"),
            ("ls -l", "total"),
            ("pwd", "/"),
        ],
    )
    def test_exec_command_common_commands(self, shell_factory, cmd, expected_output):
        exec_action = ExecCommand()
        exec_action._shells = lambda: shell_factory

        response = exec_action.execute(ShellExecRequest(cmd=cmd), {})

        assert expected_output in response.stdout

    @patch("shutil.which")
    def test_spawn_process_command_not_found(self, mock_which, temp_dir):
        mock_which.return_value = None

        spawn_action = SpawnProcess()

        with pytest.raises(ValueError, match="Command `python` not found!"):
            spawn_action.execute(
                SpawnRequest(cmd="python test_script.py", working_dir=temp_dir), {}
            )
