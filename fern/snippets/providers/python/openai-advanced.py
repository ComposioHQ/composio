# Advanced OpenAI Provider Configuration

from openai import OpenAI
from composio import Composio
from composio_openai import OpenAIProvider

# Initialize with custom configuration
composio = Composio(
    api_key="your-composio-api-key",
    provider=OpenAIProvider()
)
openai = OpenAI(api_key="your-openai-api-key")

user_id = "user-dev-178"

# Select specific tools
specific_tools = composio.tools.get(
    user_id=user_id,
    tools=["GITHUB_CREATE_ISSUE", "GITHUB_COMMENT_ON_ISSUE", "SLACK_SEND_MESSAGE"]
)

# Get entire toolkits
toolkit_tools = composio.tools.get(
    user_id=user_id,
    toolkits=["github", "slack", "gmail"]
)

# Combine tools and toolkits
combined_tools = composio.tools.get(
    user_id=user_id,
    tools=["GMAIL_SEND_EMAIL"],
    toolkits=["github"]
)

# Streaming responses
stream = openai.chat.completions.create(
    model="gpt-4-turbo",
    tools=combined_tools,
    messages=[
        {"role": "user", "content": "Send an email about the latest GitHub issue"}
    ],
    stream=True
)

# Process streaming response
for chunk in stream:
    if chunk.choices[0].delta.tool_calls:
        # Handle incremental tool call updates
        print(f"Tool call chunk: {chunk.choices[0].delta.tool_calls}")
    elif chunk.choices[0].delta.content:
        # Handle content updates
        print(chunk.choices[0].delta.content, end="")

# Error handling with retry logic
import time
from typing import Optional

def execute_with_retry(tools, messages, max_retries=3):
    """Execute OpenAI completion with exponential backoff retry"""
    for attempt in range(max_retries):
        try:
            response = openai.chat.completions.create(
                model="gpt-4-turbo",
                tools=tools,
                messages=messages
            )
            return response
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = 2 ** attempt  # Exponential backoff
            print(f"Retry {attempt + 1}/{max_retries} after {wait_time}s: {e}")
            time.sleep(wait_time)
    
# Check authentication status
def check_auth_status(user_id: str, integration: str) -> Optional[dict]:
    """Check if user has connected account for integration"""
    connections = composio.connected_accounts.get(user_id=user_id)
    
    for connection in connections:
        if connection.integration_id == integration:
            return connection
    
    # If not connected, initiate authentication
    connection_request = composio.connected_accounts.initiate(
        user_id=user_id,
        integration=integration
    )
    print(f"Please authenticate at: {connection_request.redirect_url}")
    return None