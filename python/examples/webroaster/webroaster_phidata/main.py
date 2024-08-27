from composio_phidata import ComposioToolSet, App, Action
from phi.assistant import Assistant
from phi.llm.openai import OpenAIChat
from selenium import webdriver
from time import sleep
from dotenv import load_dotenv
import os

load_dotenv()
toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
tools = toolset.get_tools(apps = [App.IMAGE_ANALYSER, App.SERPAPI, App.FIRECRAWL])

assistant = Assistant(tools=tools,               
                      llm=OpenAIChat(model="gpt-4o"),
                      show_tool_calls=True)

inpu1 = input("Enter website url:")


driver = webdriver.Chrome()
driver.get(inpu1)
sleep(5)

driver.get_screenshot_as_file("python/examples/webroaster/website1.png") #to take screenshot
driver.quit()
print("end...")

assistant.print_response("""
The input website from the user is, Analyse the image website1.png,
        Media path is python/examples/webroaster/website1.png
        and prompt is Describe the website you see. 
        Pass the media path as a list and prompt as a str
        Analyse the website text after scraping.
        Then roast the website based on the image and text analysis. Be creative and very funny.
""", markdown=True)
