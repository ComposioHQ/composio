from composio import Composio
from composio_langchain import LangchainProvider
from langchain.chat_models import init_chat_model

model = init_chat_model("gpt-4o")
composio = Composio(provider=LangchainProvider())

tools_list = composio.tools.get(user_id="sid", toolkits=["LINEAR"])

model_with_tools = model.bind_tools(tools_list)
print(model_with_tools)

result = model_with_tools.invoke("What are the linear projects assigned to me?")