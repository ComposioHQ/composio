from crewai import Agent, Task, Crew
from composio_crewai import ComposioToolSet
from composio import App, Action
from langchain_openai import ChatOpenAI


llm = ChatOpenAI(model="gpt-4-turbo")

while True:
    main_task = input("Enter the task you want to perform (or type 'exit' to quit): ")
    if main_task.lower() == 'exit':
        break

    code_interpreter_tools = ComposioToolSet().get_tools([App.CODEINTERPRETER])
    slack_tools = ComposioToolSet().get_tools([App.SLACK])

    code_interpreter_agent = Agent(
        role="Python Code Interpreter Agent",
        goal=f"""Run Python code to get acheive a task given by the user""",
        backstory="""You are an agent that helps users run Python code.""",
        verbose=True,
        tools=code_interpreter_tools,
        llm=llm,
    )

    code_interpreter_task = Task(
        description=f"""Run Python code to get acheive a task - {main_task}""",
        expected_output=f"""Python code executed successfully. The result of the task is returned - {main_task}""", 
        agent=code_interpreter_agent,
    )

    slack_agent = Agent(
        role="Slack Agent",
        goal=f"""Do things related to slack as per the user's task""",
        backstory="""You are an agent that can do anything related to Slack""",
        verbose=True,
        tools=slack_tools,
        llm=llm,
    )

    slack_task = Task(
        description=f"""Do things related to slack as per - {main_task}""",
        expected_output=f"""Slack task completed successfully as per - {main_task}""", 
        agent=slack_agent,
    )

    crew = Crew(
        agents=[code_interpreter_agent, slack_agent],
        tasks=[code_interpreter_task, slack_task],
        memory=True,
    )

    result = crew.kickoff()
    print(result)
                     

