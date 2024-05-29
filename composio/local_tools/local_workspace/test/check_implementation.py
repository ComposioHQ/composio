# flake8: noqa

from pprint import pprint

from composio.local_tools.local_workspace.cmd_manager.actions import (
    CreateFileCmd,
    CreateFileRequest,
    EditFile,
    EditFileRequest,
    FindFileCmd,
    FindFileRequest,
    GoToLineNumInOpenFile,
    GoToRequest,
    OpenCmdRequest,
    OpenFile,
    RunCommandOnWorkspace,
    RunCommandOnWorkspaceRequest,
    ScrollDown,
    ScrollDownRequest,
    ScrollUp,
    ScrollUpRequest,
    SearchDirCmd,
    SearchDirRequest,
    SearchFileCmd,
    SearchFileRequest,
    SetCursors,
    SetCursorsRequest,
)
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    KEY_CONTAINER_NAME,
    KEY_IMAGE_NAME,
    KEY_PARENT_PIDS,
    KEY_WORKSPACE_MANAGER,
    LocalDockerArgumentsModel,
    WorkspaceManagerFactory,
)
from composio.local_tools.local_workspace.history_keeper.actions import (
    GetWorkspaceHistory,
    GetWorkspaceHistoryRequest,
)
from composio.local_tools.local_workspace.workspace.actions import (
    CreateWorkspaceAction,
    CreateWorkspaceRequest,
    SetupGithubRepo,
    SetupGithubRepoRequest,
    SetupWorkspace,
    WorkspaceSetupRequest,
    WorkspaceStatus,
    WorkspaceStatusRequest,
)


#
# import autopep8
# import pylint.lint


def format_and_lint_code(source_code):
    # Format code using autopep8
    formatted_code = autopep8.fix_code(source_code)

    # Save the formatted code to a temporary file (optional


def check_simple_implementation():
    args = LocalDockerArgumentsModel(
        image_name="sweagent/swe-agent:latest",
        verbose=True,
        install_environment=True,
    )

    w = WorkspaceManagerFactory()
    h = HistoryProcessor()
    workspace_id = w.get_workspace_manager(args)

    # setup environment + copy commands + source scripts
    setup_docker_args = WorkspaceSetupRequest(workspace_id=workspace_id)
    setup_manager = SetupWorkspace()
    setup_manager.set_workspace_and_history(w, h)
    setup_manager.execute(setup_docker_args)

    # copy github repo
    copy_repo_args = SetupGithubRepoRequest(workspace_id=workspace_id)
    git_setup = SetupGithubRepo()
    git_setup.set_workspace_and_history(w, h)
    git_setup.execute(copy_repo_args)

    # create file
    create_file_cmd = CreateFileCmd()
    create_file_cmd.set_workspace_and_history(w, h)
    create_file_output = create_file_cmd.execute(
        CreateFileRequest(workspace_id=workspace_id, file_name="/SWE-bench/tmp-pv.py"),
        authorisation_data={},
    )
    print(create_file_output)

    # edit file
    edit_file_cmd = EditFile()
    edit_file_cmd.set_workspace_and_history(w, h)
    edit_file_output = edit_file_cmd.execute(
        EditFileRequest(
            workspace_id=workspace_id,
            start_line=1,
            end_line=1,
            replacement_text="""print("this is a test")""",
        ),
        authorisation_data={},
    )
    print(edit_file_output)

    run_command = RunCommandOnWorkspace()
    run_command.set_workspace_and_history(w, h)
    output = run_command.execute(
        RunCommandOnWorkspaceRequest(
            workspace_id=workspace_id, input_cmd="python /SWE-bench/tmp-pv.py"
        ),
        authorisation_data={},
    )

    print(output)


if __name__ == "__main__":
    check_simple_implementation()
