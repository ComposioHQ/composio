import os
from dotenv import load_dotenv
from composio_crewai import Action, App, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from crewai.flow.flow import Flow, listen, start, and_
from langchain_openai import ChatOpenAI
import asyncio

load_dotenv()
toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.HUBSPOT_LIST_CONTACTS_PAGE])

python_executor_agent = Agent(
    role="Lead Outreach Agent",
    goal="Given the information, draft the perfect lead outreach email. You are ",
    verbose=True,
    backstory="You are an expert in crafting perfect lead outreach emails.",
    tools=tools, # type: ignore
)

execute_code_task = Task(
    description=f"Use Hubspot, Read the names in the CRM by using listing contacts actions using every Hubspot action necessary and draft the perfect lead outreach email. Please pass in the correct params for the action",
    expected_output="Draft of a lead outreach email was created and also mention the email id of the lead",
    tools=tools, # type: ignore
    agent=python_executor_agent,
)

crew = Crew(
    agents=[python_executor_agent],
    tasks=[execute_code_task],
    process=Process.sequential,
)

class LeadOutreach(Flow):
    model='gpt-4o'
    @start()
    async def draft(self):
        result = await crew.kickoff_async()
        return result.raw
    
    @listen(draft)
    async def create_gmail_draft(self, message):
        print("Creating draft")
        res = toolset.execute_action(
            Action.GMAIL_CREATE_EMAIL_DRAFT,
            params={},
            text=message
        ) # type: ignore
        return res
    
    @listen(and_(draft, create_gmail_draft))
    async def done(self):
        print('done')
        return "Action Done"
    
async def main():
    flow = LeadOutreach()
    flow.plot('my_flow_plot')
    return await flow.kickoff_async()

if __name__ == "__main__":
    asyncio.run(main())