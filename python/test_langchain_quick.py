from composio import Composio
from composio_langchain import LangchainProvider
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

composio = Composio(provider=LangchainProvider())
tools = composio.tools.get(user_id="default", tools=["_21RISK_GET_COMPLIANCE"])

llm = ChatOpenAI(model="gpt-4.1")
resp = llm.bind_tools(tools).invoke(
    [HumanMessage(content="Get compliance records where Rank > 5")]
)

if resp.tool_calls:
    print("Tool call:", resp.tool_calls[0]["name"])
    print("Args:", resp.tool_calls[0]["args"])
else:
    print("No tool call")
    print("Response:", resp.content)
