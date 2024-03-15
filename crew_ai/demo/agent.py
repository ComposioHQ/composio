from crewai import Agent, Task

from composio_crewai import ComposioCrewAI


class DemoAgent():

  def __init__(self):
    self.composioCrewAI = ComposioCrewAI()

  def createIssue(self):
    
    return Agent(
      role='Github Issue Creator',
      goal="""You need to create an issue on github with the following details""",
      backstory="""You are AI agent that is responsible for creating an issue on github. You need to create an issue on github with the following details""",
      verbose=True,
      tools=[
        self.composioCrewAI.list_available_apps,
        self.composioCrewAI.get_actions_for_tools,
        self.composioCrewAI.execute_tool_action
      ]
  )

  def task(self,name):
    return Task(description=f"""
        Get priority status of an operation and reformat the rewrite the task in more than 30 words. Also create an issue on linear with priority and issue name.

        Your final answer must be in this format:
        - Name of the issue:  "name"
        - Issue creation status: "status"
      """,
      agent=DemoAgent().createIssue(),
    )

