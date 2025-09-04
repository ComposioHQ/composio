from composio import Composio

composio = Composio(api_key="your_composio_key")

# Send a proxy request to the endpoint
response = composio.tools.proxy(
    endpoint="/repos/composiohq/composio/issues/1",
    method="GET",
    connected_account_id="ca_jI6********",  # use connected account for github
    parameters=[
        {
            "name": "Accept",
            "value": "application/vnd.github.v3+json",
            "type": "header",
        },
    ],
)

print(response)
