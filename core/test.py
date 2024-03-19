from composio import Composio, SchemaFormat
from composio import TestIntegration, Action
from openai import OpenAI

sdk_client = Composio("yw1qb4ls4340z696zh7sa")
connection = sdk_client.get_connected_account("9c8e6e42-3837-4014-bd80-12696bd758f1")

print("Connection is", connection)
client = OpenAI(api_key="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")
response = client.chat.completions.create(
    model="gpt-4-turbo-preview",
    tools=connection.get_all_actions(format = SchemaFormat.OPENAI),
    messages=[
        {
            "role": "system",
            "content": "You are a good assistant."
        },
        {
            "role": "user",
            "content": "Create a new issue in a repository and title it 'This is so cool!', \
and the body of the issue is 'Does it work? Lets try.'. \
The owner of the repository is utkarsh-dixit and name of the repository is speedy",
        }
    ]
)

print("RECIEVED RESPONSE: ", response)

print(connection.handle_tools_calls(response))