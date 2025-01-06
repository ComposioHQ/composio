from composio_llamaindex import ComposioToolSet, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from dotenv import load_dotenv
from pathlib import Path
import os
import streamlit as st

# Load environment variables
load_dotenv()

# Choose your LLM here
llm = OpenAI(model='gpt-4o')
# llm = Groq(model="llama3-groq-70b-8192-tool-use-preview")
# llm = Cerebras(model="llama3.1-70b")

# Initialize tools and apps
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(actions=[
    Action.HUBSPOT_LIST_CONTACTS_PAGE,
    Action.HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA,
    Action.HUBSPOT_CREATE_BATCH_OF_CONTACTS,
    Action.HUBSPOT_CREATE_BATCH_OF_DEALS,
    Action.HUBSPOT_SEARCH_DEALS_BY_CRITERIA,
    Action.HUBSPOT_CREATE_TICKET_OBJECT,
    Action.HUBSPOT_SEARCH_TICKETS_BY_CRITERIA,
    Action.HUBSPOT_SECURE_PRODUCT_SEARCH_BY_CRITERIA
    # Add more actions or apps as needed
])

# System messages for context
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            """
            You are a CRM Agent that has access to CRMs such as Hubspot, Attio, Zoho, and more. 
            You are supposed to use and execute the actions available to you, to answer the user's queries.
            """
        )
    )
]

# Initialize the agent
agent = FunctionCallingAgentWorker(
    tools=tools,  # Tools available for the agent to use # type: ignore
    llm=llm,  # Language model for processing requests
    prefix_messages=prefix_messages,  # Initial system messages for context
    max_function_calls=10,  # Maximum number of function calls allowed
    allow_parallel_tool_calls=False,  # Disallow parallel tool calls
    verbose=True,  # Enable verbose output
).as_agent()

# Streamlit frontend
st.title("CRM Agent")
st.write("👋 Hi! I'm here to help with your CRM needs. Type your queries below, and I'll assist you.")

# Input field for user queries
user_query = st.text_input("📝 What would you like to do?")

# Placeholder for agent response
response_placeholder = st.empty()

# Execute agent query
if st.button("Execute"):
    if user_query.strip():
        try:
            with st.spinner("Thinking..."):
                response = agent.chat(user_query)
            response_placeholder.success(f"📊 Result:\n{response}")
        except Exception as e:
            response_placeholder.error(f"⚠️ Oops! Something went wrong: {e}")
    else:
        response_placeholder.warning("⚠️ Please enter a query to execute.")

# Sidebar with example queries
st.sidebar.title("Examples")
st.sidebar.write("Here are some example actions you can try:")
st.sidebar.write("- Can you find all contacts in our CRM")
st.sidebar.write("- We’ve just closed a deal with XYZ Corp for $50,000. Can you create a new deal in the system?")
st.sidebar.write("- A customer reported an issue with a delayed order. Can you create a ticket for this problem in our CRM?")
st.sidebar.write("- Secure product search")
