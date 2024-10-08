from json import load
from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.core import Settings
from llama_index.llms.openai import OpenAI
from llama_index.llms.groq import Groq
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

load_dotenv()



llm = Groq(model="llama-3.1-70b-versatile", stop_sequences=["\n\n"])

toolset = ComposioToolSet()

# Get the Gmail tools from the ComposioToolSet
gmail_tools = toolset.get_tools(apps=[App.GMAIL])

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
            You are an AI assistant that is assigned the following tasks and is an expert in all of the below mentioned work:
            1. Fetch recent newsletter emails from the inbox. Please look for labels 'newsletter' only for last 7 days. Don't add any other unnecessary filters.
                You are an expert in retrieving and organizing email content, with a keen eye for identifying relevant newsletters. Today's date is {datetime.now().strftime('%B %d, %Y')}. You are writing an email to a reader who is interested in the stock market and trading.
            2. Summarize the content of newsletter emails, highlighting key information and trends
                You are an expert in analyzing and summarizing complex information, with a talent for distilling essential points from various sources. Today's date is {datetime.now().strftime('%B %d, %Y')}. You are writing an email to a reader who is interested in the stock market and trading. You are writing an email to a reader who is interested in the stock market and trading.

            3. Send the summarized newsletter content via email to investtradegame@gmail.com with a professional and engaging format
                You are an expert in composing and sending emails with well-formatted, visually appealing content. You have a knack for creating engaging subject lines and structuring information for easy readability. Today's date is {datetime.now().strftime('%B %d, %Y')}. You are writing an email to a reader who is interested in the stock market and trading.
                """
        )
    )
]

agent = FunctionCallingAgentWorker(
    tools=gmail_tools,  # Tools available for the agent to use
    llm=llm,  # Language model for processing requests
    prefix_messages=prefix_messages,  # Initial system messages for context
    max_function_calls=10,  # Maximum number of function calls allowed
    allow_parallel_tool_calls=False,  # Disallow parallel tool calls
    verbose=True,  # Enable verbose output
).as_agent()
task = f"""
        1. "Fetch the most recent newsletter emails from the inbox. "
        "Look for emails with subjects containing words like 'newsletter', 'update', or 'digest'. "
        "Retrieve the content of these emails, including any important links or attachments. "
        "Pay special attention to newsletters from reputable sources and industry leaders."

        2. "Summarize the content of the fetched newsletter emails. "
        "Create a concise yet comprehensive summary highlighting the key points from each newsletter. "
        "Organize the summaries in a clear and readable format, grouping related topics if applicable. "
        "Include any important links, statistics, or data points that add value to the summary. "
        "Identify and highlight any emerging trends or significant developments across the newsletters."




        3. "Compose and send an email containing the summarized newsletter content. "
        "Use the Gmail API to send the email to investtradegame@gmail.com. "
        "Ensure the email has a clear, engaging subject line and well-formatted content. "
        "Use the following structure for the email:\n\n"
        f"Subject: Your Weekly News Digest - {datetime.now().strftime('%B %d, %Y')}\n\n"
        "<h1>Weekly News Digest</h1>\n\n"
        "<p>Dear Reader,</p>\n\n"
        "<p>Here's your curated summary of this week's top news items and insights:</p>\n\n"
        "[Insert summarized content here]\n\n"
        "Each main section should be separated by a horizontal rule, like this:\n"
        "<hr>\n\n"
        "Structure the content logically, with clear sections for each summarized newsletter or topic area.\n"
        "Use appropriate HTML formatting such as <strong> for headlines, "
        "<ul> and <li> for bullet points, and <br> for line breaks to enhance readability.\n\n"
        "Include relevant links using HTML anchor tags: <a href='URL'>Link Text</a>\n\n"
        "Include a brief introduction at the beginning to set the context and a conclusion at the end "
        "to summarize the key takeaways and trends observed across the newsletters.\n\n"
        "<footer>\n"
        "<p>For more details on these stories, click on the provided links or stay tuned to our next update. "
        "If you have any questions or feedback, please don't hesitate to reach out.</p>\n\n"
        "<p>Best regards,<br>Your Newsletter Summary Team</p>\n"
        "</footer>\n\n"
        "Important: Ensure all HTML tags are properly closed and nested correctly."

"""
response = agent.chat(task)

