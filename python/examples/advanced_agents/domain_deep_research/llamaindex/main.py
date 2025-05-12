from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.groq import Groq
from llama_index.llms.openai import OpenAI
from llama_index.llms.openrouter import OpenRouter
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Initialize toolset and LLM
toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.EXA_SEARCH, Action.EXA_SIMILARLINK, Action.GOOGLEDOCS_CREATE_DOCUMENT])
print(os.getenv('OPENROUTER_API_KEY'))
function_calling_llm = OpenRouter(model="qwen/qwen3-32b", api_key=os.getenv('OPENROUTER_API_KEY'))

# Setup chatbot-style prefix messages
def create_prefix_message():
    return [
        ChatMessage(
            role="system",
            content=(
                """
                You are a sophisticated research assistant. Perform comprehensive research on the given query and provide detailed analysis. Focus on:
                - Key concepts and main ideas
                - Current developments and trends
                - Important stakeholders and their roles
                - Relevant data and statistics
                - Critical analysis and implications
                
                Create a detailed report on the research and write it in google docs.
                
                Ensure all information is accurate, up-to-date, and properly sourced. Present findings in a clear, structured format suitable for professional analysis.
                """
            ),
        )
    ]

prefix_messages = create_prefix_message()

# Initialize the agent
agent = FunctionCallingAgentWorker(
    tools=tools, # type: ignore
    llm=function_calling_llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()

def chatbot():
    print("🤖: Hi! I can help you research any topics. Let's start!")
    
    # Get the main research topic
    topic = input("What topic would you like to research: ")
    domain = input('What domain is this topic in: ')
    # Generate and ask probing questions
    questions_prompt = f"""
    Generate 5-6 specific questions about the topic to help guide the research agent to research about the topic: {topic} and this is the domain: {domain}, so don't ask too complex probing questions, keep them relatively simple. Focus on:
    Mostly make these yes or no questions.
    Do not ask the user for information, you are supposed to help him/her with the research, you can't ask questions about the topic itself, 
    you can ask the user about what he wants to know about the topic and the domain.
    Format your response as a numbered list, with exactly one question per line.
    Example format:
    1. [First question]
    2. [Second question]
    """
    
    questions_response = function_calling_llm.complete(questions_prompt)
    # Clean up the response to ensure proper formatting
    cleaned_questions = [q.strip() for q in questions_response.text.strip().split('\n') 
                        if q.strip() and any(q.startswith(str(i)) for i in range(1, 7))]
    
    # Show all questions at once and collect one response
    print("\n🤖: Please consider these questions about your research needs:")
    print("\n".join(cleaned_questions))
    
    answer = input("\nPlease provide your response addressing these questions: ")
    
    # Combine all information for research
    research_prompt = f"""
    Topic: {topic}
    Domain: {domain}
    
    User's Response to Questions:
    {answer}
    
    Please research this topic thoroughly and create a comprehensive report in Google Docs.
    """
    
    print("\n🤖: Thank you! I'll now conduct the research and create a detailed report...")
    res = agent.chat(research_prompt)
    print("\n🤖: Here's your research report:")
    print(res.response)

if __name__ == "__main__":
    chatbot()
