from composio import Composio
from composio_anthropic import AnthropicProvider
# from composio_langchain import LangchainProvider

composio = Composio(provider=AnthropicProvider())
# composio = Composio(provider=LangchainProvider())

tools = composio.tools.get(user_id="user@acme.org", toolkits=["LINEAR"])

tools = composio.tools.get(
    user_id="0001",
    tools=["LINEAR_CREATE_LINEAR_ISSUE", "GITHUB_CREATE_COMMIT"]
)

tools = composio.tools.get(user_id="john", search="hackernews posts")
