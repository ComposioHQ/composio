from crewai import Agent, Task

from crew_ai.composio_crewai import  ComposioToolset
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(openai_api_key="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")

class DemoAgent():

  def __init__(self):
    self.composioCrewAI = ComposioToolset(["github"])
    print(self.composioCrewAI)

  def createAgent(self):
    return Agent(
      role='Github Issue Creator',
      goal="""You need to create an issue on github with the following details""",
      backstory="""You are AI agent that is responsible for creating an issue on github. You need to create an issue on github with the following details""",
      verbose=True,
      tools=self.composioCrewAI,
      llm=llm
    )

  def task(self,name):
    print(f"Creating issue for {name}")
    print(self.composioCrewAI)
    return Task(description=f"""
        Get priority status of an operation and reformat the rewrite the task in more than 30 words. Also create an issue on linear with priority and issue name.

        Your final answer must be in this format:
        - Name of the issue:  "name"
        - Issue creation status: "status"
      """,
      agent=DemoAgent().createAgent(),
    )
  
if __name__ == "__main__":
  agent = DemoAgent()

  issue_from_arg = input("Enter your github issue name: ")

  taskFinal = agent.task(issue_from_arg).execute()
  print(taskFinal)