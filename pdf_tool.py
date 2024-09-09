import os
import dotenv
from crewai import Agent, Task, Crew
from composio_langchain import ComposioToolSet, App
from langchain_google_genai import ChatGoogleGenerativeAI
from PyPDF2 import PdfReader
import google.generativeai as genai

dotenv.load_dotenv()


os.environ["GOOGLE_API_KEY"] = "Api key"
genai.configure(api_key=os.environ["GOOGLE_API_KEY"])

llm = ChatGoogleGenerativeAI(model="gemini-pro", temperature=0.7)

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.SERPAPI])

def extract_pdf_text(file_path):
    reader = PdfReader(file_path)
    text = ""
    metadata = reader.metadata
    for page in reader.pages:
        text += page.extract_text()
    return text, metadata

researcher = Agent(
    role='PDF Researcher',
    goal='Research and extract relevant text and metadata from the provided PDF file.',
    backstory="""
    You are an expert PDF researcher. Your goal is to extract text and metadata from the given PDF file and analyze the content.
    """,
    verbose=True,
    tools=tools,
    llm=llm
)

analyser = Agent(
    role='PDF Analyst',
    goal='Analyze the extracted text and metadata from the PDF for relevant insights.',
    backstory="""
    You are an expert PDF analyst. Your task is to provide a detailed analysis of the text and metadata extracted from the PDF file.
    """,
    verbose=True,
    tools=tools,
    llm=llm
)

recommend = Agent(
    role='PDF Recommender',
    goal='Provide recommendations based on the analyzed PDF content.',
    backstory="""
    You are an expert PDF recommender. Based on the analysis, provide recommendations on the document's relevance and importance.
    """,
    verbose=True,
    tools=tools,
    llm=llm
)

pdf_file_path = "F:\comp\Sumanthkumar_CV.pdf"  

pdf_text, pdf_metadata = extract_pdf_text(pdf_file_path)

research_task = Task(
    description=f"Research and extract relevant information from the following PDF content: {pdf_text[:1000]}... (truncated for brevity)",
    agent=researcher,
    expected_output="A summary of key information extracted from the PDF."
)

analysis_task = Task(
    description="Analyze the extracted information from the PDF for relevant insights.",
    agent=analyser,
    expected_output="A detailed analysis of the PDF content including key insights and findings."
)

recommendation_task = Task(
    description="Provide recommendations based on the analyzed PDF content.",
    agent=recommend,
    expected_output="A list of recommendations based on the PDF analysis."
)

pdf_analysis_crew = Crew(
    agents=[researcher, analyser, recommend],
    tasks=[research_task, analysis_task, recommendation_task],
    verbose=1
)

result = pdf_analysis_crew.kickoff()

print(result)