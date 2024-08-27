import os
from time import sleep
from dotenv import load_dotenv
from selenium import webdriver
from phi.assistant import Assistant
from phi.llm.openai import OpenAIChat
from composio_phidata import ComposioToolSet, App

# Load environment variables
load_dotenv()

def initialize_assistant():
    """Initialize and return the AI assistant with necessary tools."""
    toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
    tools = toolset.get_tools(apps=[App.IMAGE_ANALYSER, App.SERPAPI, App.FIRECRAWL, App.BROWSERBASE_TOOL])
    
    return Assistant(
        tools=tools,
        llm=OpenAIChat(model="gpt-4"),
        #llm = Ollama(model="llama3"),
        show_tool_calls=True
    )

def capture_website_screenshot(url, filename):
    """Capture a screenshot of the given website URL."""
    driver = webdriver.Chrome()
    try:
        driver.get(url)
        sleep(5)  # Wait for the page to load
        driver.get_screenshot_as_file(filename)
    finally:
        driver.quit()

def main():
    # Initialize the AI assistant
    assistant = initialize_assistant()
    
    # Get website URL from user
    website_url = input("Enter website URL: ")
    
    # Capture website screenshot
    screenshot_path = "python/examples/webroaster/website1.png"
    capture_website_screenshot(website_url, screenshot_path)
    print("Screenshot captured successfully.")

    # Analyze the website and generate a roast
    analysis_prompt = f"""
    Take a screenshot of the website using Browserbase and save it as website1.png at the {screenshot_path}
    Analyze the image {screenshot_path}:
    1. Describe the website you see.
    2. Analyze the website text after scraping.
    3. Roast the website based on the image and text analysis. Be creative and very funny.

    Media path: [{screenshot_path}]
    """
    
    assistant.print_response(analysis_prompt, markdown=True)

if __name__ == "__main__":
    main()
