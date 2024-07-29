# Extending Functionality of the SWE Agent

This guide outlines the process for enhancing the SWE agent's capabilities by adding new tools or extending existing ones.

> **Important**: Always run the SWE agent with `COMPOSIO_DEV_MODE=1` when adding new tools to ensure changes are reflected within the Docker container.

## Adding a New Tool

To incorporate a new local tool into the agent's toolkit:

1. Consult the [Local Tool documentation](https://docs.composio.dev/introduction/foundations/components/local_tools) for detailed instructions.
2. Follow the guidelines to integrate your tool seamlessly with the existing framework.

## Implementing a New Shell Tool

Shell tools are crucial for executing commands within the agent's environment. Here's how to add a new shell tool:

### Key Features of Shell Sessions

The agent supports multiple shell sessions, enabling:

1. Dynamic creation of shell sessions
2. Automatic use of the most recent active session
3. Persistence of session-specific environments
4. Seamless switching between sessions
5. Efficient multi-tasking and context management

### Implementation Steps

For tools that need to execute in the active shell session (e.g., `git` commands, bash commands):

1. Implement the following classes:

   - `ShellRequest`
   - `ShellExecResponse`
   - `BaseExecCommand`

2. Utilize the `exec_cmd` function to execute commands within the shell environment.

### Example Implementation

For a practical example of implementing a shell tool, refer to the [Git Patch Tool](https://github.com/composiohq/composio/blob/master/python/composio/tools/local/shelltool/git_cmds/actions/get_patch.py). This example demonstrates how to structure your tool and integrate it with the agent's shell capabilities.

By following these guidelines, you can effectively extend the SWE agent's functionality to suit your specific development needs.
