from crewai import Crew
from textwrap import dedent
from linear_agent import DemoAgent

from dotenv import load_dotenv
load_dotenv()

if __name__ == "__main__":
  agent = DemoAgent()

  issue_from_arg = input("Enter your github issue name: ")

  taskFinal = agent.task(issue_from_arg).execute()
  print(taskFinal)
