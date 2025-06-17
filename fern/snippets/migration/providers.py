from composio import Composio
# from composio_langchain import LangchainProvider

composio = Composio()
# composio = Composio(provider=LangchainProvider())

tools = composio.tools.get(
    user_id="0001",
    tools=["LINEAR_CREATE_LINEAR_ISSUE", "GITHUB_CREATE_COMMIT"]
)
# tools returned is formatted for the provider. by default, OpenAI.
