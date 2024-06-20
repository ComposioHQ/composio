from pathlib import Path

from composio_crewai import Action, App, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from crewai.task import TaskOutput
from langchain_openai import ChatOpenAI


CONFIG_FILE_PATH = "./task_config.yaml"

# Path of the current script
script_path = Path(__file__).resolve()
script_dir = script_path.parent
task_config_path = script_dir / Path(CONFIG_FILE_PATH)

task_data = ""

composio_toolset = ComposioToolSet()

llm = ChatOpenAI(model="gpt-4-turbo")

base_role = (
    "You are the best programmer. You think carefully and step by step take action."
)

goal = "Help fix the given issue / bug in the code. And make sure you get it working. "

tools = composio_toolset.get_actions(actions=[Action.GREPTILE_CODEQUERY])


if __name__ == "__main__":

    agent_1 = Agent(
        role=base_role,
        goal=goal,
        backstory="You are the best programmer. You think carefully and step by step take action.",
        verbose=True,
        tools=tools,
        llm=llm,
        memory=True,
        cache=False,
    )

    task = Task(
        description="Can you tell me in which file enums are stored? for repo samparkai/composio. ",
        agent=agent_1,
        expected_output="Name of the file",
    )

    my_crew = Crew(
        agents=[agent_1],
        tasks=[task],
        process=Process.sequential,
        full_output=True,
        verbose=True,
        cache=False,
        memory=True,
    )

    my_crew.kickoff()
    print(my_crew.usage_metrics)
