import gradio as gr
from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize tools and language model
toolset = ComposioToolSet()
tools = toolset.get_tools(apps=[App.WEBTOOL, App.EXA])
llm = OpenAI(model="gpt-4o")
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are a Lead Outreach Agent that is equipped with great tools for research "
            "and is an expert writer. Your job is to first research some info about the lead "
            "given to you and then draft a perfect ideal email for whatever input task is given to you. "
            "Always write the subject, content of the email and nothing else."
        )
    )
]

agent = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True
).as_agent()

# Function to generate email
def generate_email(lead, email_id, purpose):
    response = agent.chat(f"These are the lead details that we know {lead}. This is the purpose to write the email: {purpose}. Write a well written email for the purpose to the lead.")
    
    # Collecting final response
    final_response = response.response
    
    return final_response

def send_email(email_content, email_id):
    t = email_content+"This is the email id:"+email_id
    from composio import ComposioToolSet
    composio_toolset = ComposioToolSet()
    composio_toolset.execute_action(
        "gmail_send_email",
        params={},
        text=str(t),
    )
    return "Email sent"
# Setting up Gradio interface
with gr.Blocks() as demo:
    gr.Markdown("### Lead Outreach Email Generator")
    
    lead_input = gr.Textbox(label="Lead Details", placeholder="Enter lead details here...")
    email_input = gr.Textbox(label="Email ID", placeholder="Enter recipient's email here...")
    purpose_input = gr.Textbox(label="Purpose and your details", placeholder="Enter purpose of the email, dont forget to mention your name in it...")
    
    submit_button = gr.Button("Generate Email")
    send_button = gr.Button("Send Email")
    output_message = gr.Textbox(label="Was the email sent?", placeholder="not sent")

    output_email = gr.Textbox(label="Generated Email", interactive=False)
    
    submit_button.click(generate_email, inputs=[lead_input, email_input, purpose_input], outputs=output_email)
    send_button.click(send_email, inputs = [output_email, email_input], outputs= output_message)
    

# Launching the Gradio app
demo.launch()