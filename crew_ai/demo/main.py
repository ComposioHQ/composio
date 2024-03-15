from agent import DemoAgent
if __name__ == "__main__":
  agent = DemoAgent()

  issue_from_arg = input("Enter your github issue name: ")

  taskFinal = agent.task(issue_from_arg).execute()
  print(taskFinal)
