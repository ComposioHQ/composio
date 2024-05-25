def check_simple_implementation():
    args = LocalDockerArgumentsModel(
        image_name="sweagent/swe-agent:latest",
        verbose=True,
        install_environment=True,
    )
    image_name = args.image_name
    env = LocalDockerWorkspace(args)
    print(env.container_name, env.image_name)
    container_process = env.container
    container_name = env.container_name
    container_pid = container_process.pid
    parent_pids = env.parent_pids

    # setup environment + copy commands + source scripts
    setup_docker_args = DockerSetupEnvRequest(container_name=container_name,
                                              workspace_id="123",
                                              image_name=image_name)
    setup_manager = DockerSetupManager(setup_docker_args)
    setup_manager.set_container_process(container_process, parent_pids)
    setup_manager.set_env_variables()

    # copy github repo
    copy_repo_args = CopyGithubRepoRequest(
        container_name=env.container_name,
        workspace_id="123",
        repo_name="princeton-nlp/SWE-bench",
        image_name=image_name)
    resp = execute_copy_github_repo(copy_repo_args, container_process, parent_pids)

    # load all the special commands
    special_commands_util = ShellEditor(COMMANDS_CONFIG_PATH)
    all_special_cmds = special_commands_util.get_all_commands()

    # run special command
    special_cmd_args: EditorOperationRequest = EditorOperationRequest(command="find_file",
                                                                      workspace_id="123",
                                                                      arguments=["README.md", "/SWE-bench/"])
    output = special_commands_util.perform_operation(special_cmd_args, container_process, container_name,
                                                     image_name, parent_pids)
    print(output)


if __name__ == "__main__":
    check_simple_implementation()

