import os
from datetime import datetime
import dotenv
import requests
from bs4 import BeautifulSoup
from composio_openai import Action, ComposioToolSet, App
from openai import OpenAI

# Load environment variables
dotenv.load_dotenv()

# URL of the competitor website
competitor_url = os.getenv("URL", "")
if competitor_url == "":
    competitor_url = input("Enter the URL of the competitor website: ")

# actual parent page in Notion
parent_page = os.getenv("NOTION_PARENT_PAGE", "")
if parent_page == "":
    parent_page = input("Enter the actual parent page in Notion: ")

openai_client = OpenAI()

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.NOTION])

# Retrieve the current date and time
date = datetime.today().strftime("%Y-%m-%d")
timezone = datetime.now().astimezone().tzinfo


def remove_tags(html):
    soup = BeautifulSoup(html, "html.parser")
    return soup.get_text()


# Function to scrape website content
def scrape_website(url):
    try:
        response = requests.get(url)
        response.raise_for_status()  # Check if the request was successful
        html_content = response.content.decode("utf-8")  # Decode content to a string
        cleaned_content = remove_tags(html_content)
        return cleaned_content
    except requests.exceptions.RequestException as e:
        return f"An error occurred while requesting the URL: {e}"


competitor_data = scrape_website(competitor_url)

assistant = openai_client.beta.assistants.create(
    name="PR Review Assistant",
    description="You are an AI Agent with access to Notion.",
    instructions=f"Create a page for the competitor with the specified name. If a page with the same name already exists, append a unique identifier as a prefix or suffix. Create the page under '{parent_page}', if the parent page '{parent_page}' doesn't exist, find the most suitable parent page among existing pages. Place the pointers given to you in the created page without altering them. \nPointers to be included in the page: {competitor_data}. \nYour task ends only after successfully putting in the pointers in the page that you created.",
    model="gpt-4o",
    tools=tools,
)

thread = openai_client.beta.threads.create()
openai_client.beta.threads.messages.create(
    thread_id=thread.id, role="user", content=competitor_data
)

competitor_url = f"https://platform.openai.com/playground/assistants?assistant={assistant.id}&thread={thread.id}"
print("Visit this URL to view the thread: ", competitor_url)

run = openai_client.beta.threads.runs.create(
    thread_id=thread.id, assistant_id=assistant.id
)

composio_toolset.wait_and_handle_assistant_tool_calls(
    client=openai_client,
    run=run,
    thread=thread,
)
