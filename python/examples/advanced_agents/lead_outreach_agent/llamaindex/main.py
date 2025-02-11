from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
toolset = ComposioToolSet(api_key="")
tools = toolset.get_tools(actions=[Action.HUBSPOT_LIST_CONTACTS_PAGE, Action.GMAIL_CREATE_EMAIL_DRAFT])

llm = OpenAI(model="gpt-4o")

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
            "You are a Lead Outreach Agent that is has access to the CRM through HubSpot."
            "and is an expert writer. Your job is to first research some info about the lead "
            "given to you and then draft a perfect ideal email for whatever input task is given to you. "
            """
        ),
    )
]

agent = FunctionCallingAgentWorker(
    tools=tools, # type: ignore
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()

user_input = f"Draft an email for each lead in my Hubspot contacts page introducing yourself and asking them if they're interested in integrating AI Agents in their workflow."
response = agent.chat(user_input)