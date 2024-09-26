from tabnanny import verbose
from urllib import response
from composio_crewai import ComposioToolSet, App, Action
from crewai import Crew, Agent, Task, Process
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
from pathlib import Path
import os
load_dotenv()
import agentops
AGENTOPS_API_KEY = os.environ["AGENTOPS_API_KEY"]
agentops.init(AGENTOPS_API_KEY)

llm = ChatOpenAI(model='gpt-4o')
#Settings.llm = Groq(model="llama3-groq-70b-8192-tool-use-preview")
#llm = Groq(model="llama3-groq-70b-8192-tool-use-preview")

GOOGLE_SHEET_ID = '1i8OwCM_o2E4tmpZ18-2Jgu8G42ntPWoUgGhfbcyxnoo'
#GOOGLE_SHEET_LINK + 'https://docs.google.com/spreadsheets/d/1i8OwCM_o2E4tmpZ18-2Jgu8G42ntPWoUgGhfbcyxnoo/edit?gid=0#gid=0z'
composio_toolset = ComposioToolSet(output_dir=Path("/Users/composio/Desktop/sample-projects/ppt_builder"))
tools = composio_toolset.get_tools(actions=[Action.CODEINTERPRETER_EXECUTE_CODE,
                                            Action.CODEINTERPRETER_GET_FILE_CMD,
                                            Action.CODEINTERPRETER_RUN_TERMINAL_CMD,
                                            Action.GOOGLESHEETS_BATCH_GET])

ppt_agent = Agent(
    role="Google Sheets Assistant",
    goal="Read Google Sheets Data",
    backstory=f"""
            You are an AI assistant specialized in creating PowerPoint presentations using the python-pptx library. 
            Your task is to analyze the Google Sheets data from the provided spreadsheet ID: {GOOGLE_SHEET_ID}. 
            Extract key insights and generate relevant charts based on this data. 
            Finally, create a well-structured presentation that includes these charts and any necessary images, ensuring 
            that the formatting is professional and visually appealing. 
            When utilizing the Gooxgle Sheets tool, only the spreadsheet ID should be passed as input parameters.
            NOTE: Mostly the user passes small sheets, so try to read the whole sheet at once and not via ranges.
    """,
    tools=tools,
)

agent_task = Task(
    description=f"""
    Create a ppt on the google sheets: {GOOGLE_SHEET_ID}. 
    Create a sandbox
    First retrieve the sheets content, then pip install python-pptx using code interpreter.
    After than run the code to create graphs from the data.
    Then write the code with python-pptx to create a ppt
    
    Ensure that the ppt is detailed and has proper formatting 
    that makes it look good. The graphs in it should be factual. 
    NOTE: Mostly the user passes small sheets, so try to read the whole sheet at once and not via ranges.
    """,
    expected_output="Sheet was read, graphs were plotted and Presentation was created",
    tools=tools,
    agent=ppt_agent,
    verbose=True,
)

crew = Crew(
    agents=[ppt_agent],
    tasks=[agent_task],
    process=Process.sequential,
)

response= crew.kickoff()
