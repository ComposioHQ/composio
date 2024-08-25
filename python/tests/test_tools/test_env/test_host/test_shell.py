from composio.tools.env.host.shell import HostShell

def passwd_change_protocol_prompt(instance):
    instance.protocol.prompt = "hostname #"
    instance.protocol.password_input = False


def passwd_write_password_to_transport(instance):
    instance.writeln("MockSSH: password is %s" % instance.valid_password)


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
