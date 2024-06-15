import click
import json
import os
import git
from pathlib import Path

from composio_coders.swe import CoderAgentArgs, CoderAgent

MODEL_ENV_CONFIG_PATH = ".composio.coder.model_env"
ISSUE_CONFIG_PATH = ".composio.coder.issue_config"
KEY_GIT_ACCESS_TOKEN = "GITHUB_ACCESS_TOKEN"


def get_git_root():
    """Try and guess the git repo, since the conf.yml can be at the repo root"""
    try:
        repo = git.Repo(search_parent_directories=True)
        path = Path(repo.git_dir)
        repo_name = path.parent.name
        return repo_name
    except git.InvalidGitRepositoryError:
        return None


@click.command(name="setup", help="🔑 Setup model configuration in the current directory")
def setup():
    """Setup model configuration in the current directory."""
    config = {}
    model_env = click.prompt("🔑 Choose the model environment to be used for initiating agent", 
                             type=click.Choice(['openai', 'azure'], case_sensitive=False))

    if model_env == "openai":
        config["model_env"] = "openai"
        api_key = click.prompt("🔑 Please enter openai API key", type=str)
        config["api_key"] = api_key
    if model_env == "azure":
        config["model_env"] = "azure"
        api_key = click.prompt("🔑 Please enter azure key", type=str)
        endpoint_url = click.prompt("🌐 Please enter Azure endpoint URL", type=str)
        config["api_key"] = api_key
        config["endpoint_url"] = endpoint_url

    config_path = Path(MODEL_ENV_CONFIG_PATH)
    with config_path.open('w') as f:
        json.dump(config, f)
    click.echo(f'🍀 Model configuration saved to {MODEL_ENV_CONFIG_PATH}')


@click.command(name="add_issue", help="➕ Add an issue configuration to the current directory")
def add_issue():
    """Add an issue configuration to the current directory."""
    curr_repo_name = get_git_root()
    repo_name = click.prompt("Enter the repo name to start solving the issue", type=str, default="", show_default=False)
    if not repo_name or not repo_name.strip():
        if curr_repo_name:
            click.echo(f"no git repo-given. Initializing git repo from current directory: {curr_repo_name}")
            repo_name = curr_repo_name
        else:
            click.echo("❗!! Error: no git repo found or given. Exiting setup...")
            return
    issue_id = click.prompt("Please enter issue id", type=str)
    base_commit_id = click.prompt("Please enter base commit id", type=str, default="", show_default=False)
    issue_description = click.prompt("Please enter issue description", type=str)
    issue_config = {
        'repo_name': repo_name,
        'issue_id': issue_id,
        'base_commit_id': base_commit_id,
        'issue_description': issue_description
    }
    config_path = Path(ISSUE_CONFIG_PATH)
    with config_path.open('w') as f:
        json.dump(issue_config, f)
    click.echo(f'🍀 Issue configuration saved to {ISSUE_CONFIG_PATH}\n')


@click.command(name="solve", help="👷 Start solving the configured issue")
def solve():
    """Start solving the configured issue."""
    git_access_token = os.getenv('GIT_ACCESS_TOKEN')
    if not git_access_token:
        click.echo(f"❗ Error: {KEY_GIT_ACCESS_TOKEN} is not set in the environment.\n")
        click.echo(f"🔑 Please export your GIT access token: {KEY_GIT_ACCESS_TOKEN} and try again !")
        return

    config_path = Path(ISSUE_CONFIG_PATH)
    with config_path.open('r') as f:
        issue_config = json.load(f)

    click.echo(f"ℹ️ Starting issue solving with the following configuration: {json.dumps(issue_config, indent=4)}")

    args = CoderAgentArgs(
        repo_name=issue_config['repo_name'],
        agent_output_dir="./",
        issue_config={
            "issue_id": issue_config["issue_id"],
            "base_commit_id": issue_config["base_commit_id"],
            "issue_description": issue_config["issue_description"],
        }
    )
    coder_agent = CoderAgent(args)
    coder_agent.run()
    print("Issue solving process started.")


@click.command(name="reset", help="🔄 Reset the composio coder")
@click.help_option("--help", "-h", "-help")
def reset():
    """Reset the composio coder."""
    confirmation = click.prompt("Are you sure you want to reset the composio coder? Type 'reset' to confirm or 'cancel' to abort", default="cancel", show_default=False)
    if confirmation.lower().strip() == "reset":
        click.echo("Resetting composio coder...")
        click.echo(f"Removing {MODEL_ENV_CONFIG_PATH} and {ISSUE_CONFIG_PATH}_config files...")
        if os.path.exists(MODEL_ENV_CONFIG_PATH):
            os.remove(MODEL_ENV_CONFIG_PATH)
        if os.path.exists(ISSUE_CONFIG_PATH):
            os.remove(ISSUE_CONFIG_PATH)
        click.echo("Composio coder reset complete.")
    else:
        click.echo("Reset cancelled.")


@click.command(name="workflow", help="📋 Run the workflow: setup -> add_issue -> solve -> reset")
@click.help_option("--help", "-h", "-help")
def show_workflow():
    # Add the workflow description
    click.echo('\nWorkflow:\n')
    click.echo('  1. setup: 🔑 Setup model configuration in the current directory')
    click.echo('  2. add_issue: ➕ Add an issue configuration to the current directory')
    click.echo('  3. solve: 👷 Start solving the configured issue')
    click.echo('  4. reset: Reset the composio coder')


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

if __name__ == '__main__':
    cli()
