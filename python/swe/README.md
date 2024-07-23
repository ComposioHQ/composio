# SWE Development Kit

## Table of Contents

- [SWE Development Kit](#swe-development-kit)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Dependencies](#dependencies)
  - [Getting Started](#getting-started)
    - [Creating a new agent](#creating-a-new-agent)
    - [Workspace Environment](#workspace-environment)
    - [Customising the workspace environment](#customising-the-workspace-environment)
    - [Running the Benchmark](#running-the-benchmark)

## Overview

`swekit` is a framework for building SWE agents on by utilising composio tooling ecosystem. SWE Kit allows you to

- Scaffold agents which works out-of-the-box with choice of your agentic framework, `crewai`, `llamaindex`, etc...
- Tools to add or optimise your agent's abilities
- Benchmark your agents against `SWE-bench`

## Dependencies

Before getting started, ensure you have the following set up:

1. **Installation**:

   ```
   pip install swekit composio-core
   ```

2. **Install agentic framework of your choice and the Composio plugin for the same**:
   Here we're using `crewai` for the example:

   ```
   pip install crewai composio-crewai
   ```

3. **GitHub Access Token**:

   The agent requires a github access token to work with your repositories, You can create one at https://github.com/settings/tokens with necessary permissions and export it as an environment variable using `export GITHUB_ACCESS_TOKEN=<your_token>`

4. **LLM Configuration**:
   You also need to setup API key for the LLM provider you're planning to use. By default the agents scaffolded by `swekit` uses `openai` client, so export `OPENAI_API_KEY` before running your agent

## Getting Started

### Creating a new agent

1. Scaffold your agent using:

   ```
   swekit scaffold crewai -o <path>
   ```

   This creates a new agent in `<path>/agent` with four key files:

   - `main.py`: Entry point to run the agent on your issue
   - `agent.py`: Agent definition (edit this to customise behaviour)
   - `prompts.py`: Agent prompts
   - `benchmark.py`: SWE-Bench benchmark runner

2. Run the agent:
   ```
   cd agent
   python main.py
   ```
   You'll be prompted for the repository name and issue.

### Workspace Environment

The SWE-agent runs in Docker by default for security and isolation. This sandboxes the agent's operations, protecting against unintended consequences of arbitrary code execution.

The composio toolset has support for different types of workspaces.

1. Host - This will run on the host machine.

```python
from composio import ComposioToolSet, WorkspaceType

toolset = ComposioToolSet(
    workspace_config=WorkspaceType.Host()
)
```

2. Docker - This will run inside a docker container

```python
from composio import ComposioToolSet, WorkspaceType

toolset = ComposioToolSet(
    workspace_config=WorkspaceType.Docker()
)
```

On the docker container you can configure and expose the port for development
as per your requirements. You can also use `workspace.as_prompt()` method to
generate a workspace description for setting up your agent.

```python
from composio import ComposioToolSet, WorkspaceType

toolset = ComposioToolSet(
    workspace_config=WorkspaceType.Docker(
        ports={
            8001: 8001,
        }
    )
)
```

You can read more about configuring docker ports [here](https://docker-py.readthedocs.io/en/stable/containers.html#docker.models.containers.ContainerCollection.run).

3. E2B - This will run inside a E2B Sandbox

```python
from composio import ComposioToolSet, WorkspaceType

toolset = ComposioToolSet(
    workspace_config=WorkspaceType.E2B(),
)
```

4. FlyIO - This will run inside a FlyIO machine

```python
from composio import ComposioToolSet, WorkspaceType

toolset = ComposioToolSet(
    workspace_config=WorkspaceType.FlyIO(),
)
```

FlyIO also allows for configuring ports for development/deployment.

```python
from composio import ComposioToolSet, WorkspaceType

composio_toolset = ComposioToolSet(
    workspace_config=WorkspaceType.FlyIO(
        image="composio/composio",
        ports=[
            {
                "ports": [
                    {"port": 443, "handlers": ["tls", "http"]},
                ],
                "internal_port": 80,
                "protocol": "tcp",
            }
        ],
    )
)
```

You can read more abour configuring network ports on flyio machine [here](https://fly.io/docs/machines/api/machines-resource/#create-a-machine-with-services)


### Customising the workspace environment

The workspace environment contains following environment variables by default

- `COMPOSIO_API_KEY`: The composio API key for interacting with composio API.
- `COMPOSIO_BASE_URL`: Base URL for composio API server.
- `GITHUB_ACCESS_TOKEN`: Github access token for the agent.
- `ACCESS_TOKEN`: Access token for composio tooling server.

If you want to provide addional environment configuration you can use `environment` argument when creating a workspace configuration.

```python
composio_toolset = ComposioToolSet(
    workspace_config=WorkspaceType.Docker(
        environment={
            "SOME_API_TOKEN": "<SOME_API_TOKEN>",
        }
    )
)
```

### Running the Benchmark

[SWE-Bench](https://www.swebench.com/) is a comprehensive benchmark designed to evaluate the performance of software engineering agents. It comprises a diverse collection of real-world issues from popular Python open-source projects, providing a robust testing environment.

To run the benchmark:

1. Ensure Docker is installed and running on your system.
2. Execute the following command:
   ```
   cd agent
   python benchmark.py --test-split=<test_split>
   ```
   - By default, `python benchmark.py` runs only 1 test instance.
   - Specify a test split ratio to run more tests, e.g., `--test-split=1:300` runs 300 tests.

To run the benchmarks in `E2B` or `FlyIO` sandbox, you can set the `workspace_env` in the `evaluate` function call in `benchmark.py`


```python
from composio import WorkspaceType

(...)

    evaluate(
        bench,
        dry_run=False,
        test_range=test_range,
        test_instance_ids=test_instance_ids_list,
        workspace_env=WorkspaceType.E2B
    )
```

To use `E2B` or `FlyIO` sandboxes you'll require API key for respective platforms, to use `E2B` export your API key as `E2B_API_KEY` and to use `FlyIO` export your API token as `FLY_API_TOKEN`.

**Note**: We utilize [SWE-Bench-Docker](https://github.com/aorwall/SWE-bench-docker) to ensure each test instance runs in an isolated container with its specific environment and Python version.

To extend the functionality of the SWE agent by adding new tools or extending existing ones, refer to the [Development Guide](DEVELOPMENT.md).
