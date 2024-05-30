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

    # search_cmd = SearchDirCmd("abc")
    # search_cmd.set_workspace_and_history(w, h)
    # output = search_cmd.execute(
    #     SearchDirRequest(
    #         workspace_id=workspace_id,
    #         search_term="'golden-python search'",
    #         dir="/SWE-bench/",
    #     ),
    #     authorisation_data={},
    # )

    run_command = RunCommandOnWorkspace()
    run_command.set_workspace_and_history(w, h)
    output = run_command.execute(
        RunCommandOnWorkspaceRequest(
            workspace_id=workspace_id, input_cmd="python /SWE-bench/swebench/metrics"
        )
    )

    print(output)


if __name__ == "__main__":
    check_simple_implementation()
