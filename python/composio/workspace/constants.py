from composio.workspace.base_workspace import WorkspaceEnv, Command

DOCKER_ENV_VARS = {
    "WINDOW": 100,
    "OVERLAP": 2,
    "CURRENT_LINE": 0,
    "CURRENT_FILE": '',
    "SEARCH_RESULTS": (),
    "SEARCH_FILES": (),
    "SEARCH_INDEX": 0
}
DOCKER_STATE_CMD = ""
docker_state_command: Command = Command(
        name="state",
        code="""state() {
            echo '{"working_dir": "'$(realpath --relative-to=$ROOT/.. $PWD)'"}';
        };""",
    )

commands_to_execute = (
            [docker_state_command.code]
            + ["pip install flake8"]
            + [f"{k}={v}" for k, v in DOCKER_ENV_VARS.items()]
        )

docker_workspace_env = WorkspaceEnv(
    copy_file_to_workspace=[],
    commands_to_execute=commands_to_execute,
    setup_cmd=docker_state_command.code
)
