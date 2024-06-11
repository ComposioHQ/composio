# Import necessary libraries
import os
from datetime import datetime

import dotenv
import requests
from bs4 import BeautifulSoup
from composio_crewai import App, ComposioSDK, ComposioToolSet
from crewai import Agent, Task
from flask import Flask, jsonify
from langchain_openai import ChatOpenAI


# Load environment variables
dotenv.load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")
model = os.getenv("MODEL")
# URL of the competitor website
url = os.getenv("URL")
# actual parent page in Notion
parent_page = os.getenv("NOTION_PARENT_PAGE")


# Initialize the language model
llm = ChatOpenAI(model=model, api_key=openai_api_key)

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
    description=f"Create a page for the competitor with the specified name. If a page with the same name already exists, append a unique identifier as a prefix or suffix. Create the page under '{parent_page}', if the parent page '{parent_page}' doesn't exist, find the most suitable parent page among existing pages. Place the pointers given to you in the created page without altering them. \nPointers to be included in the page: {competitor_data}. \nYour task ends only after successfully putting in the pointers in the page that you created.",
    expected_output="List down the contents of the page and title of the page created.",
    agent=agent,
    async_execution=True,
)

# Execute the task, and see the page in notion get populated!
task.execute()
