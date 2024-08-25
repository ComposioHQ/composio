from composio.tools.env.host.shell import HostShell


def test_host_shell() -> None:
    shell = HostShell()
    shell.setup()
    output = shell.exec(cmd="pwd")

    assert output["exit_code"] == 0
    assert len(output["stderr"]) == 0


def test_host_shell_with_env() -> None:
    shell = HostShell(environment={"NAME": "'John Doe'"})
    shell.setup()
    output = shell.exec(cmd="echo $NAME")

    assert output["exit_code"] == 0
    assert output["stdout"] == "John Doe\n"
