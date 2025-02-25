import os
from google import genai
from composio_gemini import ComposioToolSet, App, Action
from dotenv import load_dotenv
from google.genai import types

load_dotenv()

toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.WEBTOOL_SCRAPE_WEBSITE_CONTENT, Action.RAGTOOL_RAG_TOOL_QUERY, Action.RAGTOOL_ADD_CONTENT_TO_RAG_TOOL])

config = types.GenerateContentConfig(tools=tools) # type: ignore

client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

# Generate directly with generate_content.
response = client.models.generate_content(
    model='gemini-2.0-flash',
    config=config,
    contents="""
    You're job is to scrape a website using the tools and convert it to a prompt that anyone can just plug in
    into an LLM and ask questions about the website. The url to scrape is https://composio.dev.
    Then use the RAG tool to add content to the RAG. The content should be the output of the scraping.
    """
)
print(response.text)


while True: 
    answer = input('What question do you have?: ')
    response = client.models.generate_content(
    model='gemini-2.0-flash',
    config=config,
    contents=f'You have just scraped a website and added the scraped content to a RAG, you have the ability to query the RAG. Answer the user s question: {answer}. Assume every question refers to the scraped content. Use the RAG query tool to query the Vector DB and answer the user s question.'
    )
    print(response.text)
