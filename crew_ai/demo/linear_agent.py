from crewai import Agent, Task

# from tools.status_tools import StatusTools

import os
from dotenv import load_dotenv
from langchain.tools import tool
from langchain.chat_models.openai import ChatOpenAI


class DemoAgent():

  def summarize(self):
    return Agent(
      role='Project Manager',
      goal="""Reformat the issue name and determing the priority of the task and then make sure to create an issue on linear.""",
      backstory="""You're the project manager and you need rewrite the task name so that it is more descriptive and determine its priority and then create task on linear. You can't do it manually as you have to do it for multiple tasks. You need to automate this process.""",
      verbose=True,
      tools=[
        # StatusTools().getStatus,
        # StatusTools().rewrite,
        # StatusTools().create_issue_on_linear
      ]
  )

  def task(self,name):
    return Task(description=f"""
        Get priority status of an operation and reformat the rewrite the task in more than 30 words. Also create an issue on linear with priority and issue name.

        Your final answer must be in this format:
        - Name of the task:  "name"
        - Priority: "priority"
        - Linear status: "status"

        Name of the task by the user: "{name}"
      """,
      agent=DemoAgent().summarize(),
    )

