from composio_crewai import ComposioToolSet, App, Action
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()
llm = ChatOpenAI(openai_api_key=os.environ["OPENAI_API_KEY"],model="gpt-4o")

toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
image_analyser_tool = toolset.get_tools(apps=[App.IMAGE_ANALYSER])
text_scraper_tool = toolset.get_tools(apps=[App.FIRECRAWL])

tools = toolset.get_tools(apps = [App.IMAGE_ANALYSER, App.SERPAPI])
Image_Agent = Agent(
    role="Design Roaster",
    goal="To roast the design of the website to point out how the owner can improve it",
    backstory=(
        "You are an expert designer who designs visually beautiful websites"
        "You are also a standup comedian"
        "Your job is to roast the website design and be extremely funny while doing it."
    ),
    verbose = True,
    tools=image_analyser_tool,
    allow_delegation=False,
    )

Copy_Agent = Agent(
    role="Website Copy Writer",
    goal = "Scrape the Website text and Roast it",
    backstory=(
        "You are an expert writer and standup comedian"
        "Your job is to look at the website content and roast the style of writing"
    ),
    verbose=True,
    tools=text_scraper_tool,
    allow_delegation=False,
    )

Roaster = Agent(
    role="Manager",
    goal = "Your job is to manage Copy Agent and Design Roaster, Delegate work to both",
    backstory=(
        "You are an expert manager"
        "Your job is to manage Copy Agent and Design Roaster, Delegate work to both"
    ),
    verbose=True,
    tools=[],
    allow_delegation=True,
)

inpu1 = input("Enter website url:")
from selenium import webdriver
from time import sleep

driver = webdriver.Chrome()
driver.get(inpu1)
sleep(5)

driver.get_screenshot_as_file("python/examples/webroaster/website1.png") #to take screenshot
driver.quit()
print("end...")

main_task = Task(
    description=f"""The input website from the user is {inpu1}, Analyse the image website1.png,
        Media path is [/content/website1.png]
        and prompt is Describe the website you see. 
        Pass the media path as a list and prompt as a str
        Analyse the website text after scraping.
        Then roast the website based on the image and text analysis. Be creative and very funny.
     """,
    agent = Roaster,
    expected_output="The roast was complete",
    tools=tools,
)

crew = Crew(
    agents=[Image_Agent, Copy_Agent],
    tasks=[main_task],
    process=Process.sequential,
    verbose = True,
    max_iterations=1,
)
inputs = {
    "media_paths":["/Users/composio/Desktop/composio/python/examples/webroaster/website1.png"], #Update with your image path
    "prompt":"Critique the image on design style"
}
res = crew.kickoff(inputs=inputs)
print(res)