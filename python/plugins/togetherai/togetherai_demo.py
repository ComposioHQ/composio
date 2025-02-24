from composio_togetherai import Action, ComposioToolSet
from together import Together


client = Together(
    api_key="59114908afa42e6b013964084e5b5fe52d375b8b2418e848d3f16bcee96f905a"
)
toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.GMAIL_SEND_EMAIL])


response = client.chat.completions.create(
    tools=tools,
    model="mistralai/Mixtral-8x7B-Instruct-v0.1",
    messages=[
        {
            "role": "user",
            "content": "Send an email to abhishek@composio.dev with body:'test email' & subject: 'test subject'",
        }
    ],
)

res = toolset.handle_tool_calls(response)
print(res)
