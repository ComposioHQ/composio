from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.groq import Groq
from llama_index.llms.openai import OpenAI
from llama_index.llms.cerebras import Cerebras
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize toolset and LLM
toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.EXA_SEARCH, Action.EXA_SIMILARLINK, Action.GOOGLEDOCS_CREATE_DOCUMENT])

function_calling_llm = OpenAI(model="gpt-4o")
deepseek_llm = Groq(model="deepseek-r1-distill-llama-70b")
#llm = Cerebras(model="llama-3.3-70b", is_chat_model=True)

# Setup chatbot-style prefix messages
def create_prefix_message():
    return [
        ChatMessage(
            role="system",
            content=(
                """
                Perform deep research on the given query and return the results.
                
                """
            ),
        )
    ]

prefix_messages = create_prefix_message()

# Initialize the agent
agent = FunctionCallingAgentWorker(
    tools=tools, # type: ignore
    llm=function_calling_llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()

# Task-specific logic in a chatbot-like flow
def chatbot():
    print("🤖: Hi! I can help you research content based on the latest trends. Let’s start!")
    human_input = input("What do you want to research: ")
    questions = deepseek_llm.complete("Suggest a list of questions to research on the topic: " + human_input)
    res = agent.chat(str(questions)+"\n These are the questions you need to research about, they are related to the topic: " + human_input+"\n After research is complete, create a google doc with all the information and share the link with me")
    print(res.response)

if __name__ == "__main__":
    chatbot()
