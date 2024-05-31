from langchain_community.document_loaders import WebBaseLoader
from langchain_community.llms import HuggingFaceEndpoint
from langchain_community.chat_models.huggingface import ChatHuggingFace
from langchain.agents import AgentExecutor, load_tools
from langchain.agents.format_scratchpad import format_log_to_str
from langchain.agents.output_parsers import ReActJsonSingleInputOutputParser
from langchain import hub
from langchain.tools.render import render_text_description
from composio_langchain import ComposioToolSet, Action, App

# Initialize the language model and toolset
llm = HuggingFaceEndpoint(repo_id="HuggingFaceH4/zephyr-7b-beta")
chat_model = ChatHuggingFace(llm=llm)
composiotoolset = ComposioToolSet()
tools = composiotoolset.get_tools(apps=[App.SERPAPI])
# Setup the ReAct style prompt template
prompt = hub.pull("hwchase17/react-json")
prompt = prompt.partial(
    tools=render_text_description(tools),
    tool_names=", ".join([t.name for t in tools]),
)

# Define the agent
chat_model_with_stop = chat_model.bind(stop=["\nInvalidStop"])
agent = (
    {
        "input": lambda x: x["input"],
        "agent_scratchpad": lambda x: format_log_to_str(x["intermediate_steps"]),
    }
    | prompt
    | chat_model_with_stop
    | ReActJsonSingleInputOutputParser()
)

# Execute the agent to retrieve and summarize news
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, handle_parsing_errors=True)
agent_executor.return_intermediate_steps = True

# Retrieve the latest AI news
res = agent_executor.invoke({
    "input": "Use SERP to find the latest AI news, take only description of article."
})

# Summarize the retrieved news
res2 = agent_executor.invoke({
    "input": res['output'] + ' Summarize this'
})
