banner = """
 _____ _____ __    _____ _____         
|   __|  _  |  |  |   __|   __|                
|__   |     |  |__|   __|__   |
|_____|__|__|_____|_____|_____|  
 _____ _____ _____ _____  _____ 
|  _  |   __|   __|     ||_   _|
|     |  |  |   __|   | |  | |  
|__|__|_____|_____|___|_|  |_|  
-
░█████╗░░█████╗░███╗░░░███╗██████╗░░█████╗░░██████╗██╗░█████╗░
██╔══██╗██╔══██╗████╗░████║██╔══██╗██╔══██╗██╔════╝██║██╔══██╗
██║░░╚═╝██║░░██║██╔████╔██║██████╔╝██║░░██║╚█████╗░██║██║░░██║
██║░░██╗██║░░██║██║╚██╔╝██║██╔═══╝░██║░░██║░╚═══██╗██║██║░░██║
╚█████╔╝╚█████╔╝██║░╚═╝░██║██║░░░░░╚█████╔╝██████╔╝██║╚█████╔╝
░╚════╝░░╚════╝░╚═╝░░░░░╚═╝╚═╝░░░░░░╚════╝░╚═════╝░╚═╝░╚════╝░

"""

print(banner)
from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.groq import Groq
from dotenv import load_dotenv


load_dotenv()

toolset = ComposioToolSet()
tools = toolset.get_tools(apps=[
    App.GMAIL,
    App.RAGTOOL,
    App.CALENDLY,
    App.EXA
])

llm = Groq(model='llama-3.3-70b')
llm = OpenAI(model="gpt-4o")

name = input('Enter name: ')
company = input('Enter company name: ')
email = input('Enter email id: ')
purpose = input('How do you want Composio to help you: ')

# Set up prefix messages for the agent
sales_agent_prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
            You are a sales agent that enriches leads and then write an outreach email and send it on gmail.
            You are acting on the behalf of Karan Vaidya, Co Founder of Composio. If you are given the customer reply as input, 
            then draft a perfect reply email based on the customer's email.
            """
        ),
    )
]

your_company_name = 'Composio'

doc_agent_prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
            You are a company analysis agent that can collect info about a specific company by looking at their website and docs.
            Then analyse the company and info about it, the services is it offers, its business models, its customer base etc.,
            Figure out the whole thing and add the raw scraped data in the RAG vector Store with the RAG Tool.
            """
        ),
    )
]

rag_agent = FunctionCallingAgentWorker(
    tools=tools,  # type: ignore
    llm=llm,
    prefix_messages=doc_agent_prefix_messages,
    max_function_calls=15,
    allow_parallel_tool_calls=False,
    verbose=True
).as_agent()

rag_response = rag_agent.chat(f"Figure out the data for the company: {your_company_name}, the website is composio.dev")

sales_agent = FunctionCallingAgentWorker(
    tools=tools,  # type: ignore
    llm=llm,
    prefix_messages=sales_agent_prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()

user_input = f"""
This individual has filled the form.
Name: {name}
Company: {company}
Email: {email}
Looking for the following services from Composio: {purpose}

Here's the response from the data collection agent: {rag_response.response}

You also have access to the RAG tool to query/verify any information about the company
Understand the purpose and use the RAG tool to understand Composio as a company 
and then send the perfect outreach email to the request. Keep the email short.
"""

response = sales_agent.chat(user_input)
calendly_link = 'https://calendly.com/soham-composio/chat'
listener = toolset.create_trigger_listener()

@listener.callback(filters={"trigger_name": "GMAIL_NEW_GMAIL_MESSAGE"})
def callback_function(event):
    print(event.payload)
    sales_agent.chat(f'This is the response to the email you just sent:{str(event.payload)}, reply to this thread in a short manner and nice way. If its worth, send a calendar link through calendly, heres the link you need to send: {calendly_link}.')

print("Listening")
listener.wait_forever()