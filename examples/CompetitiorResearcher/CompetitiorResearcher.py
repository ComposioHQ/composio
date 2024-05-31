import os, re, time, requests, base64, dotenv
from bs4 import BeautifulSoup
from datetime import datetime
from flask import Flask, jsonify
from openai import OpenAI, OpenAIError
from composio_crewai import ComposioToolSet, App, ComposioSDK
from crewai import Agent, Task
from langchain_openai import ChatOpenAI

dotenv.load_dotenv()
llm = ChatOpenAI(openai_api_key=os.environ["OPENAI_API_KEY"], model_name="gpt-4-turbo-preview")
composiotoolset = ComposioToolSet()
tools = composiotoolset.get_tools(apps=[App.NOTION])

date = datetime.today().strftime('%Y-%m-%d')
timezone = datetime.now().astimezone().tzinfo

def remove_tags(html):
    soup = BeautifulSoup(html, "html.parser")
    return soup.get_text()

def get_info(content):
    info = {
        "Summary": "Detailed competitor analysis goes here",
        "Key Points": "Key points extracted from the website content"
    }
    return info

def scrape_website(url):
    content = []
    reqs = requests.get(url)
    content.append(remove_tags(reqs.content))
    cleaned_content = "\n".join(content)
    competitor_info = get_info(cleaned_content)
    return jsonify(competitor_info)

def step_callback(step):
    print(f"Step: {step}")

agent = Agent(
    role="Notion Agent",
    goal="Take action on Notion.",
    backstory="You are an AI Agent with access to Notion",
    verbose=True,
    tools=composio_crewai,
    llm=llm,
    step_callback=step_callback,
)

url = "http://competitor-website.com"  # Replace with the actual URL
parent_page = "Competitors"  # Replace with the actual parent page in Notion
competitor_data = scrape_website(url).get_json()

task = Task(
    description=f"Create a page for the competitor with the specified name. If a page with the same name already exists, append a unique identifier as a prefix or suffix. Create the page under '{parent_page}', if the parent page '{parent_page}' doesn't exist, find the most suitable parent page among existing pages. Place the pointers given to you in the created page without altering them. \nPointers to be included in the page: {competitor_data}. \nYour task ends only after successfully putting in the pointers in the page that you created.",
    expected_output="List down the contents of the page and title of the page created.",
    agent=agent,
    async_execution=True,
)

task.execute()
