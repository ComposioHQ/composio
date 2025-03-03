import os
import dotenv
from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.groq import Groq

dotenv.load_dotenv()
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.HACKERNEWS])

#llm = Groq(model="deepseek-r1-distill-llama-70b", api_key=os.environ['GROQ_API_KEY'])
llm = OpenAI(model='gpt-4o')
groq_llm = Groq(model='deepseek-r1-distill-llama-70b')

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are a Search Agent for Hackernews."
            "The user will give you a search query, your job is to rephrase it in different ways"
            "Then find the best and most relevant hackernews posts in reference to that."
        ),
    )
]

while True:
    main_task = input("What do you want to search for(or type 'exit' to quit): ")
    if main_task.lower() == 'exit':
        break

    agent = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
    ).as_agent()
    
    response = agent.chat(f"This is the user's query:{main_task}, proceed accordingly.")
    groq_resp = groq_llm.complete(f'Summarize this: {response.response} with the relevant links')
    print("Response:", groq_resp)