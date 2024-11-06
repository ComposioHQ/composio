from dotenv import load_dotenv
load_dotenv()
import os
import sys
from openai import OpenAI
from db import ChatDB

from .codebase_agent import find_code_snippet
from .tools import code_search_tool

# Add the parent directory to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

chat_db = ChatDB(db_path=os.path.join(parent_dir, 'db', 'db.json'))

def chatbot(messages: list):
    # Users query is passed in the last message, if it requires more context to answer the question it uses code_search_tool to find the relevant code snippet
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        tools=code_search_tool,
    )
    # Checking if response from above completion contains tool calls, if so it uses the tool to find the code snippet
    if completion.choices[0].message.tool_calls:
        tool_call = completion.choices[0].message.tool_calls[0]
        function_name = tool_call.function.name
        arguments = eval(tool_call.function.arguments)
        if function_name == "find_code_snippet":
            # Using the tool to find the code snippet
            result = find_code_snippet(**arguments)
            # print(f"Code snippet result: {result}")
            question = messages[-1]['content']
            prompt = f"Query: {question} \nCode snippet for context: {result}" 
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages+[{"role": "user", "content": prompt}],
            )
            
            response = completion.choices[0].message.content
            print("If(Bot): ", response)
            messages.append({"role": "assistant", "content": response})
            return response
    else:
        # If no tool calls (ie if agent already has context to answer the question), just return the response
        response = completion.choices[0].message.content
        print("Else(Bot): ", response)
        messages.append({"role": "assistant", "content": response})
        return response
