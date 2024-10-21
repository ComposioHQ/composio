import gradio as gr
from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Initialize Composio ToolSet and OpenAI model
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.EXA, App.BROWSERBASE_TOOL, App.GOOGLESHEETS])
llm = OpenAI(model="gpt-4o")

# Set up prefix messages for the agent
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are a lead research agent. Depending on the user specification, look for leads."
            "Use the browser tools available to you. Find a minimum of 10 relevant people according to the description."
            "Include the following elements in the sheet:"
            """
            Basic Contact Information:
            Full Name
            Email Address
            Phone Number
            Company Name (if applicable)
            Job Title (if applicable)
            Lead Qualification Information:
            Industry
            Company Size
            Pain Points or Needs related to your product/service
            Budget Range (if relevant)
            Purchase Timeline
            Preferred Contact Method
            Lead Source Tracking:
            Marketing Campaign Name
            Landing Page URL
            Referral Source (if applicable)
            Event/Webinar Attendee (if applicable)
            """
            "Once the leads have been found, create a google sheet and add in these details."
            "If the user gives a google sheet as input then don't create a sheet and add the data in that one."
        ),
    )
]


# Define the function that interacts with the agent
def generate_leads(business_name, lead_description):
    # Initialize the agent worker
    agent = FunctionCallingAgentWorker(
        tools=tools,
        llm=llm,
        prefix_messages=prefix_messages,
        max_function_calls=10,
        allow_parallel_tool_calls=False,
        verbose=True,
    ).as_agent()
    user_input = f"Create a lead list for {business_name}. Description: {lead_description}"
    response = agent.chat(user_input)
    return response.response

# Create Gradio Interface with two input fields and Markdown output
iface = gr.Interface(
    fn=generate_leads,
    inputs=[
        gr.Textbox(label="Business Name", placeholder="Enter your business name"),
        gr.Textbox(label="Lead Description", placeholder="Describe the kind of leads you want")
    ],
    outputs=gr.Markdown(label="Response"),  # Changed to Markdown output
    title="Lead Generation Tool",
    description="Use this tool to generate leads based on your business and specifications."
)

# Launch the interface
iface.launch()