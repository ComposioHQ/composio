import json
import click
from examples.coder_agent import run as coder_run
from composio.cli.context import Context, pass_context
from composio.cli.utils.helpfulcmd import HelpfulCmdBase


class RunSWEAgent(HelpfulCmdBase, click.Command):
    examples = [
        click.style(
            "composio run swe-agent --issue "
            "'{\"repo\": \"ComposioHQ/composio\", \"issue_id\": \"123-xyz\", \"description\": \"Fix bug in code\"}'",
            fg="green")
        + click.style("  # Run the SWE agent on a given issue from issue-json\n", fg="black"),
        click.style(
            "composio run swe-agent --issue /path/to/issue.yaml",
            fg="green"
        ) + click.style("  # Run the SWE agent on a given issue from issue-path\n", fg="black"),
    ]


@click.command(name="run-swe-agent", cls=RunSWEAgent)
@click.option(
    "--issue",
    required=True,
    type=str,
    help="JSON string representing the issue to be solved by the SWE agent",
)
@pass_context
def run_swe_agent(context: Context, issue: str) -> None:
    """Run the SWE agent on a given issue."""
    try:
        issue_dict_or_path = json.loads(issue)
        coder_run(issue_dict_or_path)  # Use the run function from coder_agent.py
    except json.JSONDecodeError as e:
        raise click.ClickException(f"Invalid JSON for issue: {e}")