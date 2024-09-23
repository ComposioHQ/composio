from crewai import Agent, Task, Crew
from langchain_openai import ChatOpenAI
from composio_crewai import ComposioToolSet, Action, App
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
# add OPENAI_API_KEY to env variables.
llm = ChatOpenAI(model="gpt-4-turbo")

while True:
    main_task = input("Enter the task you want to perform (or type 'exit' to quit): ")
    if main_task.lower() == 'exit':
        break

    # Get All the tools
    composio_toolset = ComposioToolSet(output_dir=Path.home() / "composio_output")
    tools = composio_toolset.get_tools(apps=[App.GOOGLESHEETS, App.CODEINTERPRETER])

    # Define agent
    google_sheets_agent = Agent(
        role="Google Sheets Analyzer",
        goal="Understand the Sheets Data and Plot graphs that explain it better",
        backstory=(
            "You are an AI agent specialized in analyzing Google Sheets data. "
            "Your job is to analyse the data in the google sheets. Draw key and useful insights from it. "
            "Represent the data in these sheets in plots and graphs that are easily readable"
        ),
        verbose=True,
        tools=tools,
        llm=llm,
    )

    task = Task(
        description=f"Analyze the sheet and plot the graphs based on it. The task is: {main_task}",
        agent=google_sheets_agent,
        expected_output="Key insights and several plotted graphs based on the data were returned",
    )

    my_crew = Crew(
        agents=[google_sheets_agent],
        tasks=[task],
        verbose=True
    )

    result = my_crew.kickoff()
    print(result)