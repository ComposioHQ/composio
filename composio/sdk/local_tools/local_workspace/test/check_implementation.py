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


def check_simple_implementation():
    args = LocalDockerArgumentsModel(
        image_name="sweagent/swe-agent:latest",
        verbose=True,
        install_environment=True,
    )
    image_name = args.image_name
    w = WorkspaceManagerFactory()
    workspace_id = w.get_workspace_manager(args)
    workspace = w.get_registered_manager(workspace_id)
    container_name = workspace[KEY_CONTAINER_NAME]
    image_name = workspace[KEY_IMAGE_NAME]
    container_process = workspace[KEY_WORKSPACE_MANAGER]
    parent_pids = workspace[KEY_PARENT_PIDS]

    # setup environment + copy commands + source scripts
    setup_docker_args = WorkspaceSetupRequest(workspace_id=workspace_id)
    setup_manager = SetupWorkspace("setup-workspace")
    setup_manager.execute(setup_docker_args)

    # copy github repo
    copy_repo_args = SetupGithubRepoRequest(workspace_id=workspace_id)
    git_setup = SetupGithubRepo("setyp_git_repo")
    git_setup.execute(copy_repo_args)

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

