import os
import dotenv
from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.groq import Groq

dotenv.load_dotenv()
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.EXA, App.SHELLTOOL, App.FILETOOL, App.CODEINTERPRETER])

#llm = Groq(model="llama3-70b-8192", api_key=os.environ['GROQ_API_KEY'])
llm = OpenAI(model='gpt-4o')
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are a Game Creation Agent specialized in designing and implementing games. "
            "Your role is to help users create games by:"
            "1. Understanding their game concept and requirements"
            "2. Breaking down the game into core mechanics and features"
            "3. Suggesting appropriate implementation approaches"
            "4. Helping with code structure and game logic"
            "5. Providing guidance on best practices for game development"
            "THE GAME SHOULD BE PLAYABLE and WORKING WHEN RUN WITH THE SHELL TOOL"
            "BUILD USING PYGAME AND THEN RUN THE GAME CODE AT THE END"
            "You can use various tools to create, modify, and test game code, manage files, "
            "and interpret code results. Always aim to create well-structured, maintainable games."
        ),
    )
]

while True:
    main_task = input("Describe your game idea (or type 'exit' to quit): ")
    main_task_refined = llm.complete(f"Refine this into a better prompt for someone building this game. Give detail on the gameplay mechanics, what 3 single player core features of the game are and more, and detailed. Not long and unnecessary but better prompt:{main_task}. The core idea should be same")
    if main_task.lower() == 'exit':
        break

    agent = FunctionCallingAgentWorker(
        tools=tools, # type: ignore
        llm=llm,
        prefix_messages=prefix_messages,
        max_function_calls=10,
        allow_parallel_tool_calls=False,
        verbose=True,
    ).as_agent()
    
    response = agent.chat(
        f"Let's create a game based on this idea: {main_task_refined.text}. "
        "Create the game in a file called game.py in the current directory"
        "After that is done use the Anthropic tool to find the file and run it"
        "Or use the shell tool to run it."
    )
    print("Response:", response)