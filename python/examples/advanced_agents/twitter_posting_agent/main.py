import os
import dotenv
from composio_llamaindex import App, ComposioToolSet, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.groq import Groq
from datetime import datetime
dotenv.load_dotenv()

todays_date = datetime.now()
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(actions=[Action.HACKERNEWS_GET_LATEST_POSTS, Action.TWITTER_CREATION_OF_A_POST])

#llm = Groq(model="deepseek-r1-distill-llama-70b", api_key=os.environ['GROQ_API_KEY'])
llm = OpenAI(model='o1')


prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are a Search Agent for Hackernews."
            "You are provided with today's date"
            "Find the most interesting hackernews post"
            "Once you have discovered that, post it on twitter with the link and one line description about it."
            "The structure should be One or Two line description about the post, then link to the post"
            "The output shouldnt use markdown, write normal text"
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

response = agent.chat(f"Today's date is {todays_date}, find the most interesting hackernews post and post it on twitter. ")
print("Response:", response)