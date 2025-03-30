import os
from google import genai
from composio_gemini import ComposioToolSet, App, Action
from dotenv import load_dotenv
from google.genai import types

load_dotenv()

toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.SERPAPI_SEARCH])

config = types.GenerateContentConfig(tools=tools) # type: ignore

client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

resume_path = input('Enter the google doc url for resume:')

resume_details = toolset.execute_action(
    Action.GOOGLEDOCS_GET_DOCUMENT_BY_ID,
    params={

    },
    text=f'This is the doc url: {resume_path}'
)
# Generate directly with generate_content.
response = client.models.generate_content(
    model='gemini-2.0-flash',
    config=config,
    contents=f"""
            You are a resume matching Agent, your job is to read the individual's resume,
            Understand and analyse it and find the perfect job listings for them, their resume
            should be a perfect fit for the roles. The resume content is {str(resume_details)}
            You need to provide the specific job posts for specific companies and link in your response. Also rate the resume and suggest 
            ways to improve. Don't find vague jobs like 1000+ jobs. Find specific companies, specific roles that the user can apply.
    """
)
print(response.text)



