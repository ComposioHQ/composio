from composio.sdk.local_tools.local_workspace.commons.local_docker_workspace import LocalDockerArgumentsModel
from composio.sdk.local_tools.local_workspace.commons.local_docker_workspace import (WorkspaceManagerFactory,
                                                                                     KEY_WORKSPACE_MANAGER, KEY_PARENT_PIDS,
                                                                                     KEY_CONTAINER_NAME, KEY_IMAGE_NAME)
from composio.sdk.local_tools.local_workspace.cmd_manager.actions import RunCommandOnWorkspace
from composio.sdk.local_tools.local_workspace.workspace.actions import (CreateWorkspaceAction,
                                                                        CreateWorkspaceRequest,
                                                                        SetupWorkspace,
                                                                        SetupGithubRepoRequest,
                                                                        WorkspaceSetupRequest,
                                                                        WorkspaceStatus,
                                                                        WorkspaceStatusRequest,
                                                                        SetupGithubRepo)
from composio.sdk.local_tools.local_workspace.commons.history_processor import HistoryProcessor, history_recorder

from composio.sdk.local_tools.local_workspace.cmd_manager.actions import (CreateFileCmd, CreateFileRequest,
                                                                          GoToCmd, CreateFileCmd, OpenCmd,
                                                                          GoToRequest, CreateFileRequest, OpenCmdRequest,
                                                                          SearchFileCmd, SearchDirCmd, FindFileCmd,
                                                                          SearchFileRequest, SearchDirRequest, FindFileRequest,
                                                                          SetCursors, SetCursorsRequest,
                                                                          ScrollUp, ScrollDown, ScrollDownRequest, ScrollUpRequest,
                                                                          EditFileRequest, EditFile)


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
    setup_manager = SetupWorkspace("setup-workspace")
    setup_manager.set_workspace_factory(w)
    setup_manager.execute(setup_docker_args)

    # copy github repo
    copy_repo_args = SetupGithubRepoRequest(workspace_id=workspace_id)
    git_setup = SetupGithubRepo("setyp_git_repo")
    git_setup.set_workspace_factory(w)
    git_setup.execute(copy_repo_args)

    search_cmd = SearchFileCmd("abc")
    search_cmd.set_workspace_and_history(w, h)
    search_cmd.execute(SearchFileRequest(workspace_id=workspace_id,
                                         search_term="golden",
                                         file_name="./xyz",), authorisation_data={})

    # get history
    from pprint import pprint
    pprint(h.get_history(workspace_id))

    # load all the special commands
    # special_commands_util = ShellEditor(COMMANDS_CONFIG_PATH)
    # all_special_cmds = special_commands_util.get_all_commands()
    #
    # # run special command
    # special_cmd_args: EditorOperationRequest = EditorOperationRequest(command="find_file",
    #                                                                   workspace_id="123",
    #                                                                   arguments=["README.md", "/SWE-bench/"])
    # output = special_commands_util.perform_operation(special_cmd_args, container_process, container_name,
    #                                                  image_name, parent_pids)
    # print(output)


if __name__ == "__main__":
    check_simple_implementation()

