# pylint: disable=E0611
from praisonai import PraisonAI

from composio_praisonai import Action, ComposioToolSet


# pylint: enable=E0611

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

tool_section_str = composio_toolset.get_tools_section(tools)
print(tool_section_str)

# Example agent_yaml content
agent_yaml = (
    """
framework: "crewai"
topic: "Github Management"

roles:
  developer:
    role: "Developer"
    goal: "An expert programmer"
    backstory: "A developer exploring new codebases and have certain tools available to execute different tasks."
    tasks:
      star_github:
        description: "Star a repo composiohq/composio on GitHub"
        expected_output: "Response whether the task was executed."
"""
    + tool_section_str
)

# Create a PraisonAI instance with the agent_yaml content
praison_ai = PraisonAI(agent_yaml=agent_yaml)

# Run PraisonAI
result = praison_ai.main()

# Print the result
print(result)
