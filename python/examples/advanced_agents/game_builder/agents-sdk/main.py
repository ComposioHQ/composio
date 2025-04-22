import os
import dotenv
from composio_openai_agents import App, ComposioToolSet
from agents import Agent, Runner, ModelSettings
dotenv.load_dotenv()

toolset = ComposioToolSet()

tools = toolset.get_tools(apps=[App.FILETOOL, App.SHELLTOOL])

agent = Agent(name="Game Developer", 
              instructions="You are a creative and expert AI game developer. Your task is to design and create unique games using the `pygame` library in Python.",
              tools=tools,
              model='gpt-4.1',
              model_settings=ModelSettings(temperature=0.9))


task = input('What do you want to build?: ')
result = Runner.run_sync(agent, task)
print(result.final_output)
