# pylint: disable=E0611
from composio_praisonai import Action, ComposioToolSet
from praisonai import PraisonAI


# pylint: enable=E0611

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER]
)

tool_section_str = composio_toolset.get_tools_section(tools)
print(tool_section_str)

# Example agent_yaml content
agent_yaml = (
    """
framework: "crewai"
topic: "Github Mangement"

roles:
  developer:
    role: "Developer"
    goal: "An expert programmer"
    backstory: "A developer exploring new codebases and have certain tools available to execute different tasks."
    tasks:
      star_github:
        description: "Star a repo ComposioHQ/composio on GitHub"
        expected_output: "Response wheather the task was executed."
"""
    + tool_section_str
)

# Create a PraisonAI instance with the agent_yaml content
praison_ai = PraisonAI(agent_yaml=agent_yaml)

# Run PraisonAI
result = praison_ai.main()

# Print the result
print(result)
