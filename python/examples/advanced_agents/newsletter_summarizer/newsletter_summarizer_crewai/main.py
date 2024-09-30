import os
import dotenv
from composio_langchain import Action, App, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from langchain_groq import ChatGroq
from datetime import datetime

# Load environment variables from .env file
dotenv.load_dotenv()

# Initialize the ComposioToolSet
toolset = ComposioToolSet()

# Get the Gmail tools from the ComposioToolSet
gmail_tools = toolset.get_tools(apps=[App.GMAIL])

# Initialize the ChatOpenAI model with GPT-4 and API key from environment variables
llm = ChatGroq(model="llama-3.1-70b-versatile", stop_sequences=["\n\n"])

# Define the Email Fetcher Agent
email_fetcher_agent = Agent(
    role="Email Fetcher Agent",
    goal="Fetch recent newsletter emails from the inbox. Please look for labels 'newsletter' only for last 7 days. Don't add any other unnecessary filters.",
    verbose=True,
    memory=True,
    backstory=f"You are an expert in retrieving and organizing email content, with a keen eye for identifying relevant newsletters. Today's date is {datetime.now().strftime('%B %d, %Y')}. You are writing an email to a reader who is interested in the stock market and trading.",
    llm=llm,
    allow_delegation=False,
    tools=gmail_tools,
)

# Define the Summarizer Agent
summarizer_agent = Agent(
    role="Summarizer Agent",
    goal="Summarize the content of newsletter emails, highlighting key information and trends",
    verbose=True,
    memory=True,
    backstory=f"You are an expert in analyzing and summarizing complex information, with a talent for distilling essential points from various sources. Today's date is {datetime.now().strftime('%B %d, %Y')}. You are writing an email to a reader who is interested in the stock market and trading. You are writing an email to a reader who is interested in the stock market and trading.",
    llm=llm,
    allow_delegation=False,
    tools=[],
)

# Define the Email Sender Agent
email_sender_agent = Agent(
    role="Email Sender Agent",
    goal="Send the summarized newsletter content via email to investtradegame@gmail.com with a professional and engaging format",
    verbose=True,
    memory=True,
    backstory=f"You are an expert in composing and sending emails with well-formatted, visually appealing content. You have a knack for creating engaging subject lines and structuring information for easy readability. Today's date is {datetime.now().strftime('%B %d, %Y')}. You are writing an email to a reader who is interested in the stock market and trading.",
    llm=llm,
    allow_delegation=False,
    tools=gmail_tools,
)

# Define the task for fetching emails
fetch_emails_task = Task(
    description=(
        "Fetch the most recent newsletter emails from the inbox. "
        "Look for emails with subjects containing words like 'newsletter', 'update', or 'digest'. "
        "Retrieve the content of these emails, including any important links or attachments. "
        "Pay special attention to newsletters from reputable sources and industry leaders."
    ),
    expected_output="A detailed list of recent newsletter emails with their content, including any relevant links or attachments",
    tools=gmail_tools,
    agent=email_fetcher_agent,
)

# Define the task for summarizing emails
summarize_emails_task = Task(
    description=(
        "Summarize the content of the fetched newsletter emails. "
        "Create a concise yet comprehensive summary highlighting the key points from each newsletter. "
        "Organize the summaries in a clear and readable format, grouping related topics if applicable. "
        "Include any important links, statistics, or data points that add value to the summary. "
        "Identify and highlight any emerging trends or significant developments across the newsletters."
    ),
    expected_output="A comprehensive and well-structured summary of the newsletter emails, including key points, trends, and important links",
    agent=summarizer_agent,
    context=[fetch_emails_task],
)

# Define the task for sending the summary email
send_summary_task = Task(
    description=(
        "Compose and send an email containing the summarized newsletter content. "
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
    ),
    expected_output="Confirmation that the well-formatted, detailed summary email with important links has been sent to investtradegame@gmail.com",
    tools=gmail_tools,
    agent=email_sender_agent,
    context=[summarize_emails_task],
)

# Define the crew with the agents and tasks
crew = Crew(
    agents=[email_fetcher_agent, summarizer_agent, email_sender_agent],
    tasks=[fetch_emails_task, summarize_emails_task, send_summary_task],
    process=Process.sequential,
)

# Kickoff the process and print the result
result = crew.kickoff()
print("Newsletter Summary Process Completed:")
print(result)
