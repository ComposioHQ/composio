from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from Tools.audio_trancriber import audio_transcriber_tool
from Tools.composio_slack import composio_slack_tool
import os
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from dotenv import load_dotenv
load_dotenv()

@CrewBase
class PodSumCrew:
    "Podcast summarizer and slack messenger Crew"
    agents_config = 'config/agents.yaml'
    tasks_config = 'config/tasks.yaml'
    audio_tool = [audio_transcriber_tool]
    slack_tool = composio_slack_tool()
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    llm_model =  AzureChatOpenAI(openai_api_version=os.getenv("AZURE_OPENAI_VERSION", "2023-07-01-preview"),
            azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt4chat"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", "https://gpt-4-trails.openai.azure.com/"),
            api_key=os.getenv("AZURE_OPENAI_KEY"))
    
    @agent
    def summary_agent(self) -> Agent:
        return Agent(
            config = self.agents_config['Transcriber_summarizer'],
            tools = self.audio_tool,
            verbose = True,
            llm = self.llm_model,
            allow_delegation = False,
        )
    
    @agent
    def slack_agent(self) -> Agent:
        return Agent(
            config = self.agents_config['slack_messenger'],
            tools = self.slack_tool,
            verbose = True,
            llm = self.llm_model,
        )
    
    @task
    def generate_summary(self) -> Task:
        return Task(
            config=self.tasks_config['summarize_podcast_task'],
            tools=self.audio_tool,
            agent=self.summary_agent(),
        )
    
    @task
    def send_message(self) -> Task:
        return Task(
            config=self.tasks_config['send_message_to_slack_task'],
            tools=self.slack_tool,
            agent=self.slack_agent(),
        )
    @crew
    def crew(self) -> Crew:
        """Creates a crew for the Podcast summarizer"""
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
        )