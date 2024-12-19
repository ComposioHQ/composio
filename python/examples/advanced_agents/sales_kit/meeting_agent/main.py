from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.cerebras import Cerebras
from llama_index.llms.groq import Groq
from dotenv import load_dotenv
from pathlib import Path
import os

load_dotenv()

# Choose your LLM here
llm = OpenAI(model='gpt-4o')
# llm = Groq(model="llama3-groq-70b-8192-tool-use-preview")
# llm = Cerebras(model="llama3.1-70b")

# Initialize tools and apps
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.GOOGLEMEET])

# System messages for context
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
            You are a helpful and proactive meeting agent with access to Google Meet and Zoom. 
            You can create meetings, analyze recordings, and assist with user requests.
            Engage conversationally, guide the user, and use the available tools to provide relevant results.
            """
        )
    )
]

# Initialize the agent
agent = FunctionCallingAgentWorker(
    tools=tools,  # Tools available for the agent to use
    llm=llm,  # Language model for processing requests
    prefix_messages=prefix_messages,  # Initial system messages for context
    max_function_calls=10,  # Maximum number of function calls allowed
    allow_parallel_tool_calls=False,  # Disallow parallel tool calls
    verbose=True,  # Enable verbose output
).as_agent()

# Interactive chat-like vibe
print("👋 Hi! I'm here to help with your meeting needs. Let's get started.")
while True:
    print("\n🔧 Actions I can help with:")
    print("1. Create a meeting")
    print("2. Analyze a recording")
    print("3. Exit")
    
    action = input("\n📝 What would you like to do? (Enter the number): ")
    
    if action == "3":  # Exit
        print("👋 Goodbye! Feel free to reach out anytime. Have a great day!")
        break
    
    elif action == "1":  # Create a meeting
        print("📅 Great! I'll create a meeting for you.")
        task = "Create a new meeting using available tools. Just create a default meeting and give the link."
        try:
            response = agent.chat(task)
            print(f"\n✅ Meeting created successfully:\n{response}\n")
        except Exception as e:
            print(f"⚠️ Oops! Something went wrong: {e}")
    
    elif action == "2":  # Analyze a recording
        recording_id = input("\n🔑 Please provide the recording ID for the analysis: ")
        if not recording_id.strip():
            print("⚠️ Recording ID cannot be empty. Please try again.")
            continue
        
        print("🔍 Analyzing the recording. This might take a moment...")
        task = f"""
        Analyze the recording with the ID {recording_id}. Use all available tools to gather insights and provide a summary.
        """
        try:
            response = agent.chat(task)
            print(f"\n📊 Analysis result:\n{response}\n")
        except Exception as e:
            print(f"⚠️ Oops! Something went wrong: {e}")
    
    else:
        print("⚠️ Invalid choice. Please select a valid option.")
