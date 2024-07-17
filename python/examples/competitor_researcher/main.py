# Import necessary libraries
import os
from datetime import datetime
import dotenv
import requests
from bs4 import BeautifulSoup
from composio_crewai import App, ComposioToolSet
from crewai import Agent, Task

# Load environment variables
dotenv.load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")
# URL of the competitor website
url = os.getenv("URL")
if not url:
    raise ValueError("'URL' is not set. It represents the competitor's website.")

# actual parent page in Notion
parent_page = os.getenv("NOTION_PARENT_PAGE")
if not parent_page:
    raise ValueError(
        "'NOTION_PARENT_PAGE' is not set. It represents the parent page in Notion under which the competitor's data is to be stored."
    )

# Initialize the language model
llm = ChatOpenAI(model="gpt-4-turbo", api_key=openai_api_key)

# Define tools for the agents using the ComposioToolSet
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.NOTION])

# Retrieve the current date and time
date = datetime.today().strftime("%Y-%m-%d")
timezone = datetime.now().astimezone().tzinfo


# Function to remove HTML tags from a string using BeautifulSoup
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


# Initialize the agent with specific role and goal
agent = Agent(
    role="Notion Agent",
    goal="Take action on Notion.",
    backstory="You are an AI Agent with access to Notion",
    verbose=True,
    tools=tools,
    llm=llm,
)

# Scrape data from the competitor website
competitor_data = scrape_website(url)

# Define the task for the agent
task = Task(
    description=f"Can you create a page with basic info on llms under parent page id 90842b92-0102-4254-840c-acc8aa6b0617",
    expected_output="New page with content created. ",
    agent=agent,
    async_execution=True,
)

# Execute the task, and see the page in notion get populated!
task.execute()
