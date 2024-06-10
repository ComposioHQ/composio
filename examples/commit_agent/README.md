# Commit Agent

## Introduction
This project is an example which uses composio to help you keep your GitHub repository and Trello board in sync. 
It automatically creates Trello cards for TODO comments and commit messages from your GitHub patches, ensuring your tasks are always 
up-to-date and organized.

## Steps to Run
### 1. Create a virtual environment
```shell
python3 -m venv ~/.venvs/commit_agent
source ~/.venvs/commit_agent/bin/activate
```
### 2. Install libraries
```shell
pip install -r requirements.txt

# Or

pip install -U composio-crewai crewai flask langchain_openai python-dotenv
```
### 3. Expose your local server to the internet using ngrok
```shell
ngrok <port_number>
```
### 4. Setup and Configure triggers
> Triggers are a set of predefined conditions. When these conditions are met, a webhook is triggered which has some sort of payload. 
```shell
# Set CallBack URL 
composio triggers callbacks set "https://<ngrok-url>/webhook"

# Enable Trigger
composio triggers enable github_commit_event
```
### 5. Configure Environment Variable
Copy `.env.example` and set up the environment variables
### 6. Retrieve Trello Board List
Go to your trello board, add `.json` to the end of the url. Search the corresponding list ids for the boards.
### 7. Run the script
```shell
python cookbook/examples/commit_agent/commit_agent.py
```
Create a commit in the configured repo. The trello board should automatically be updates!
