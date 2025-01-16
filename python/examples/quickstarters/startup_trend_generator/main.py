from composio_llamaindex import Action, ComposioToolSet, App
from llama_index.core.llms import ChatMessage
from llama_index.core.agent import FunctionCallingAgentWorker
from dotenv import load_dotenv
from llama_index.llms.openai import OpenAI

load_dotenv()

llm = OpenAI(model="gpt-4o")

toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.FIRECRAWL_SCRAPE_EXTRACT_DATA_LLM])


prefix_messages = [
    ChatMessage(
        role="system",
            content=(
                "You are a startup idea generator. You are given a list of startups, you need ot analyse the trends and suggest 5 strong ideas on what idea can be used to build a startup."
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
    
batch_name = input("Enter the batch name: ")
print(agent.chat(f"Go to https://www.ycombinator.com/companies?batch={batch_name} and find the latest startups and analyse the trends and suggest 5 strong ideas on what idea can be used to build a startup."))