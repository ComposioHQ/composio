import json
import os
import typing as t
from pathlib import Path
from urllib.parse import urlparse

import click
import git
from composio_coders.config_store import (
    AzureModelConfig,
    IssueConfig,
    ModelEnvConfig,
    OpenAiModelConfig,
)
from composio_coders.constants import (
    KEY_API_KEY,
    KEY_AZURE_ENDPOINT,
    KEY_GIT_ACCESS_TOKEN,
    KEY_MODEL_ENV,
    MODEL_ENV_AZURE,
    MODEL_ENV_OPENAI,
)
from composio_coders.context import get_context
from composio_coders.swe import CoderAgent, CoderAgentArgs

from composio.storage import LocalStorage


MODEL_ENV_CONFIG_PATH = ".composio.coder.model_env"
ISSUE_CONFIG_PATH = ".composio.coder.issue_config"


def get_git_root():
    """Try and guess the git repo, since the conf.yml can be at the repo root"""
    try:
        repo = git.Repo(search_parent_directories=True)
        origin_url = repo.remotes.origin.url
        parsed_url = urlparse(origin_url)
        repo_name = parsed_url.path.strip("/").split("/")[-1]
        if repo_name.endswith(".git"):
            repo_name = repo_name[:-4]
        return repo_name
    except git.InvalidGitRepositoryError:
        return None
    except AttributeError:
        raise KeyError("No 'origin' remote found in the repository")


@click.command(
    name="setup", help="🔑 Setup model configuration in the current directory"
)
def setup():
    """Setup model configuration in the current directory."""
    model_env = click.prompt(
        "🔑 Choose the model environment to be used for initiating agent",
        type=click.Choice(["openai", "azure"], case_sensitive=False),
    )
    ctx = get_context()
    model_config: t.Optional[ModelEnvConfig] = None
    if model_env == MODEL_ENV_OPENAI:
        api_key = click.prompt("🔑 Please enter openai API key", type=str)
        ctx.model_env = {KEY_MODEL_ENV: MODEL_ENV_OPENAI, KEY_API_KEY: api_key}
    if model_env == MODEL_ENV_AZURE:
        api_key = click.prompt("🔑 Please enter azure key", type=str)
        endpoint_url = click.prompt("🌐 Please enter Azure endpoint URL", type=str)
        ctx.model_env = {
            KEY_MODEL_ENV: MODEL_ENV_AZURE,
            KEY_API_KEY: api_key,
            KEY_AZURE_ENDPOINT: endpoint_url,
        }

    click.echo(f"🍀 Model configuration saved")


@click.command(
    name="add_issue", help="➕ Add an issue configuration to the current directory"
)
def add_issue():
    """Add an issue configuration to the current directory."""
    git_access_token = os.environ.get(KEY_GIT_ACCESS_TOKEN)
    if not git_access_token or not git_access_token.strip():
        click.echo(f"❗ Error: {KEY_GIT_ACCESS_TOKEN} is not set in the environment.\n")
        click.echo(
            f"🔑 Please export your GIT access token: {KEY_GIT_ACCESS_TOKEN} and try again !\n"
        )
        return
    curr_repo_name = get_git_root()
    repo_name = click.prompt(
        "Enter the repo name to start solving the issue",
        type=str,
        default="",
        show_default=False,
    )
    if not repo_name or not repo_name.strip():
        if curr_repo_name:
            click.echo(
                f"no git repo-given. Initializing git repo from current directory: {curr_repo_name}\n"
            )
            repo_name = curr_repo_name
        else:
            click.echo("❗!! Error: no git repo found or given. Exiting setup...")
            return
    issue_id = click.prompt("Please enter issue id", type=str)
    base_commit_id = click.prompt(
        "Please enter base commit id", type=str, default="", show_default=False
    )
    issue_description = click.prompt("Please enter issue description", type=str)
    issue_config = IssueConfig(
        repo_name=repo_name,
        base_commit_id=base_commit_id,
        issue_description=issue_description,
        issue_id=issue_id,
        path=ISSUE_CONFIG_PATH,
    )
    ctx = get_context()
    ctx.issue_config = {
        "repo_name": repo_name,
        "base_commit_id": base_commit_id,
        "issue_desc": issue_description,
        "issue_id": issue_id,
    }

    click.echo(f"🍀 Issue configuration saved\n")


@click.command(name="solve", help="👷 Start solving the configured issue")
def solve():
    """Start solving the configured issue."""
    ctx = get_context()
    issue_config = ctx.issue_config
    model_env = ctx.model_env

    click.echo(
        f"ℹ️ Starting issue solving with the following configuration: {issue_config.to_json()}\n"
    )

    args = CoderAgentArgs(
        agent_output_dir="./",
        issue_config=ctx.issue_config,
        model_env_config=ctx.model_env,
        agent_logs_dir=ctx.agent_logs_dir,
    )
    coder_agent = CoderAgent(args)
    coder_agent.run()
    print("Issue solving process started.")


@click.command(name="reset", help="🔄 Reset the composio coder")
@click.help_option("--help", "-h", "-help")
def reset():
    """Reset the composio coder."""
    confirmation = click.prompt(
        "Are you sure you want to reset the composio coder? Type 'reset' to confirm or 'cancel' to abort",
        default="cancel",
        show_default=False,
    )
    if confirmation.lower().strip() == "reset":
        click.echo("Resetting composio coder...\n")
        click.echo(
            f"Removing {MODEL_ENV_CONFIG_PATH} and {ISSUE_CONFIG_PATH}_config files...\n"
        )
        if os.path.exists(MODEL_ENV_CONFIG_PATH):
            os.remove(MODEL_ENV_CONFIG_PATH)
        if os.path.exists(ISSUE_CONFIG_PATH):
            os.remove(ISSUE_CONFIG_PATH)
        click.echo("Composio coder reset complete.")
    else:
        click.echo("Reset cancelled.")


@click.command(
    name="workflow", help="📋 Run the workflow: setup -> add_issue -> solve -> reset"
)
@click.help_option("--help", "-h", "-help")
def show_workflow():
    # Add the workflow description
    click.echo("\nWorkflow:\n")
    click.echo("  1. setup: 🔑 Setup model configuration in the current directory")
    click.echo("  2. add_issue: ➕ Add an issue configuration to the current directory")
    click.echo("  3. solve: 👷 Start solving the configured issue")
    click.echo("  4. reset: Reset the composio coder")


# Add commands to the CLI group
@click.group(name="composio-coder")
@click.pass_context
def cli(ctx) -> None:
    """Composio Coder CLI for managing the coding workspace and tasks."""


cli.add_command(setup)
cli.add_command(add_issue)
cli.add_command(solve)
cli.add_command(reset)
cli.add_command(show_workflow)

if __name__ == "__main__":
    cli()
