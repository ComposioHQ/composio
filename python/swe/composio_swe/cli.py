"""CLI for composio-swe."""

import os
import typing as t
from pathlib import Path
from urllib.parse import urlparse

import click
import git
from composio_swe.config.constants import (
    KEY_API_KEY,
    KEY_AZURE_ENDPOINT,
    KEY_GIT_ACCESS_TOKEN,
    KEY_MODEL_ENV,
    MODEL_ENV_AZURE,
    MODEL_ENV_OPENAI,
)
from composio_swe.config.context import Context, pass_context
from composio_swe.config.store import IssueConfig
from composio_swe.exceptions import ComposioSWEError
from composio_swe.scaffold import AgenticFramework, scaffold

from composio.cli.utils.params import EnumParam, PathParam


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
    except AttributeError as exc:
        raise KeyError("No 'origin' remote found in the repository") from exc


@click.group(name="composio-swe")
def swe() -> None:
    """Composio Coder CLI for managing the coding workspace and tasks."""


@swe.command(
    name="setup",
    help="🔑 Setup model configuration in the current directory",
)
@pass_context
def setup(ctx: Context):
    """Setup model configuration in the current directory."""
    model_env = click.prompt(
        "🔑 Choose the model environment to be used for initiating agent",
        type=click.Choice(["openai", "azure"], case_sensitive=False),
    )
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

    click.echo("🍀 Model configuration saved")


@swe.command(
    name="add_issue",
    help="➕ Add an issue configuration to the current directory",
)
@pass_context
def add_issue(ctx: Context):
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
    ctx.issue_config = IssueConfig.model_validate(
        {
            "repo_name": repo_name,
            "base_commit_id": base_commit_id,
            "issue_desc": issue_description,
            "issue_id": issue_id,
        }
    )

    click.echo("🍀 Issue configuration saved\n")


@swe.command(
    name="solve",
    help="👷 Start solving the configured issue",
)
@pass_context
def solve(ctx: Context):
    """Start solving the configured issue."""
    raise NotImplementedError()


@swe.command(
    name="workflow",
    help="📋 Show the workflow: setup -> add_issue -> solve",
)
@click.help_option("--help", "-h", "-help")
def show_workflow():
    # Add the workflow description
    click.echo("\nWorkflow:")
    click.echo("  1. 🔑 setup: Setup model configuration in the current directory")
    click.echo("  2. ➕ add_issue: Add an issue configuration to the current directory")
    click.echo("  3. 👷 solve: Start solving the configured issue\n")


@swe.command(name="scaffold")
@click.argument("framework", type=EnumParam(cls=AgenticFramework))
@click.option(
    "-n",
    "--name",
    type=str,
    help="Name of agent",
)
@click.option(
    "-o",
    "--outdir",
    type=PathParam(),
    help="Output directory for the agent",
)
@click.help_option("--help")
def _scaffold(
    framework: AgenticFramework,
    name: t.Optional[str] = None,
    outdir: t.Optional[Path] = None,
) -> None:
    """Scaffold and agent using Composio SWE tools"""
    try:
        output = scaffold(
            framework=framework,
            name=name,
            outdir=outdir,
        )
        click.echo(f"🤖 Scaffolded agent @ {output}")
    except ComposioSWEError as e:
        raise click.ClickException(str(e)) from e


if __name__ == "__main__":
    swe()
