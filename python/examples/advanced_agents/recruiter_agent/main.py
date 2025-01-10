from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.groq import Groq
from dotenv import load_dotenv
import os


load_dotenv()
# import agentops
# agentops.init(os.getenv("AGENTOPS_API_KEY"))


toolset = ComposioToolSet(api_key=os.getenv("COMPOSIO_API_KEY"))

tools = [*toolset.get_tools(apps=[App.GOOGLESHEETS]), *toolset.get_tools(actions=[Action.PEOPLEDATALABS_NATURAL_LANGUAGE_QUERY_ACTION])]

llm = Groq(model="llama3-groq-70b-8192-tool-use-preview")

# Set up prefix messages for the agent
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
            You are a recruiter agent. Based on user input, identify 10 highly qualified candidates using People Data Labs.
            After identifying the candidates, create a Google Sheet and add their details for the provided candidate description.
            Print the list of candidates and their details along with the Linkedin profile to the Google Sheet.
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


candidate_description = '10 Senior Python Developers working in seed to series A startups living in San Francisco'
user_input = f"Create a candidate list based on the description: {candidate_description}. Include all the important details required for the job. Add all of it the google sheet."
response = agent.chat(user_input)
print(response)