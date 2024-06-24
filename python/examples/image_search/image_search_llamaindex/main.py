import os
import dotenv
from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI

from composio.local_tools import embedtool
dotenv.load_dotenv()

toolset = ComposioToolSet(api_key=os.environ['COMPOSIO_API_KEY'])

tools = toolset.get_tools(apps=[App.EMBEDTOOL])
llm = OpenAI(model="gpt-4o")

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are now a integration agent, and what  ever you are requested, you will try to execute utilizing your toools."
        ),
    )
]

agent = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()

images_path = "./images/"
collection_name = "animals"
query_string = "horse"

response = agent.chat(
    "Create a vectorstore of name:"+collection_name+"using images in path:"+images_path+"and query the string:"+query_string
)
print("Response:", response)