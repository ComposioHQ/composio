from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain import hub
from langchain_openai import ChatOpenAI
from composio_langchain import ComposioToolSet
llm = ChatOpenAI()
import asyncio
import logging

prompt = hub.pull("hwchase17/openai-functions-agent")

composio_toolset = ComposioToolSet(api_key="fcau1ynif45lumo8txt5o", connected_account_ids={"GMAIL": "1b9c7742-ce8a-4f62-811a-b94ddc67ac5d"})
tools = composio_toolset.get_tools(actions=['BROWSER_TOOL_GET_PAGE_DETAILS','BROWSER_TOOL_GOTO_PAGE', 'BROWSER_TOOL_SCROLL_PAGE', 'BROWSER_TOOL_REFRESH_PAGE', 'GMAIL_SEND_EMAIL'])

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(
    agent=agent, 
    tools=tools, 
    verbose=True,
    handle_parsing_errors=True
)
def get_reviews(url):
    tasks = [
        f"Go to {url}",
        "Wait for the page to fully load and verify the content is accessible",
        "scroll down the page",
        "Locate the customer reviews",
        "Keep repeating the process till you find all the reviews",
        "Analyze all customer reviews on the page and provide a concise summary that includes: \
         \n- Overall rating and total number of reviews \
         \n- Key positive points mentioned frequently \
         \n- Common complaints or issues \
         \n- Notable specific feedback about product features \
         \nKeep the summary focused on helping potential buyers make an informed decision."
        "Format the summary and send the summary using gmail send mail samvit@hotmail.com"
    ]

    for task in tasks:
        try:
            result = agent_executor.invoke({"input": task})
            print(f"Task: {task}")
            print(f"Result: {result}\n")
        except Exception as e:
            print(f"Error executing task '{task}': {str(e)}\n")


url = input("Enter the URL: ")
get_reviews(url)



