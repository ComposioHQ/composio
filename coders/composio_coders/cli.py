import click
import json
import os
from pathlib import Path

from coders.composio_coders.swe import CoderAgentArgs, CoderAgent


@click.command(name="setup", help="🔑 Setup model configuration in the current directory")
@click.option('--model_env', required=True, help='🔑 Model_env to be used for intiating agent')
def setup(model_env):
    """Setup model configuration in the current directory."""
    config = {}
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

    config_path = Path('.composio.coder.model_config')
    with config_path.open('w') as f:
        json.dump(config, f)
    click.echo('🍀 Model configuration saved to .composio.coder.model_config')


@click.command(name="add_issue", help="➕ Add an issue configuration to the current directory")
def add_issue():
    """Add an issue configuration to the current directory."""
    repo_name = click.prompt("Enter the repo name to start solving the issue", type=str)
    issue_id = click.prompt("Please enter issue id", type=str)
    base_commit_id = click.prompt("Please enter base commit id", type=str)
    issue_description = click.prompt("Please enter issue description", type=str)
    issue_config = {
        'repo_name': repo_name,
        'issue_id': issue_id,
        'base_commit_id': base_commit_id,
        'issue_description': issue_description
    }
    config_path = Path('.composio.coder.issue_config')
    with config_path.open('w') as f:
        json.dump(issue_config, f)
    click.echo('🍀 Issue configuration saved to .composio.coder.issue_config\n')


@click.command(name="solve", help="👷 Start solving the configured issue")
def solve():
    """Start solving the configured issue."""
    git_access_token = os.getenv('GIT_ACCESS_TOKEN')
    if not git_access_token:
        click.echo("❗ Error: GIT_ACCESS_TOKEN is not set in the environment.")
        git_access_token = click.prompt("🔑 Please enter your GIT access token", type=str)
        os.environ['GIT_ACCESS_TOKEN'] = git_access_token

    config_path = Path('.composio.coder.issue_config')
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


@click.group(name="composio-coder")
@click.help_option("--help", "-h", "-help")
def cli() -> None:
    """Composio Coder CLI for managing the coding workspace and tasks."""


# Add commands to the CLI group
cli.add_command(setup)
cli.add_command(add_issue)
cli.add_command(solve)

if __name__ == '__main__':
    cli()
