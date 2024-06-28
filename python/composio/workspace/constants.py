from pathlib import Path

from composio.workspace.base_workspace import WorkspaceEnv, Command, CommandFile

script_path = Path(__file__).resolve()
script_dir = script_path.parent


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


def get_default_docker_env():
    command_files = ["config/commands/defaults.sh",
                     "config/commands/search.sh",
                     "config/commands/edit_linting.sh",
                     "config/commands/_split_string.py"]
    command_files_formatted = []
    for each in command_files:
        full_file_path = script_dir / Path("../local_tools/local_workspace") / Path(each)
        datum = {}
        contents = ""
        with open(full_file_path, "r", encoding="utf-8") as f:
            contents = f.read()
        datum["contents"] = contents
        filename = Path(each).name
        if not contents.strip().startswith("#!"):
            if filename.endswith(".sh"):
                # files are sourced, so they are not executable
                datum["name"] = Path(each).name
                datum["type"] = "source_file"
            elif filename.startswith("_"):
                # files are sourced, so they are not executable
                datum["name"] = Path(each).name
                datum["type"] = "utility"
            else:
                raise ValueError(
                    (
                        f"Non-shell script file {each} does not start with shebang.\n"
                        "Either add a shebang (#!) or change the file extension to .sh if you want to source it.\n"
                        "You can override this behavior by adding an underscore to the file name (e.g. _utils.py)."
                    )
                )
        else:
            # scripts are made executable
            datum["name"] = Path(each).name.rsplit(".", 1)[0]
            datum["type"] = "script"
        command_files_formatted.append(CommandFile(datum=datum["contents"], cmd_type=datum["type"], name=datum["name"]))
    docker_workspace_env = WorkspaceEnv(
            copy_file_to_workspace=command_files_formatted,
            commands_to_execute=commands_to_execute,
            setup_cmd=docker_state_command.code
        )
    return docker_workspace_env
